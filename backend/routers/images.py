import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from auth.auth import get_current_user
from config import settings
from database import get_db
from services.k8s_client import k8s_client
from services.ssh_service import SSHService, with_sudo

router = APIRouter(prefix="/api/images", tags=["images"])


class LoadRequest(BaseModel):
    node_ids: list[int]
    # 로드 시점에 입력한 sudo 비밀번호. 비우면 노드에 저장된 sudo_password 사용,
    # 그것도 없으면 sudo -n(NOPASSWD) 으로 시도.
    sudo_password: Optional[str] = None


class ReplaceRequest(BaseModel):
    image_id: int
    node_ids: list[int]
    target_image: str
    restart_deployments: bool = True


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    application: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    app_value = (application or "").strip() or None

    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        # If a row already exists for this filename, update it (reset to 'uploaded' state)
        cursor = await db.execute(
            "SELECT id FROM image_history WHERE filename = ? ORDER BY id DESC LIMIT 1",
            (file.filename,),
        )
        existing = await cursor.fetchone()
        if existing:
            image_id = existing[0]
            await db.execute(
                """UPDATE image_history
                   SET application = ?, status = 'uploaded', target_nodes = NULL,
                       loaded_by = ?, created_at = ?
                   WHERE id = ?""",
                (app_value, current_user["username"], now, image_id),
            )
            # Clean up older duplicate rows for the same filename (legacy data)
            await db.execute(
                "DELETE FROM image_history WHERE filename = ? AND id != ?",
                (file.filename, image_id),
            )
        else:
            await db.execute(
                "INSERT INTO image_history (filename, application, status, loaded_by, created_at) VALUES (?, ?, ?, ?, ?)",
                (file.filename, app_value, "uploaded", current_user["username"], now),
            )
            cursor = await db.execute("SELECT last_insert_rowid()")
            image_id = (await cursor.fetchone())[0]
        await db.commit()
        return {
            "id": image_id,
            "filename": file.filename,
            "application": app_value,
            "status": "uploaded",
            "size": len(content),
        }
    finally:
        await db.close()


@router.get("")
async def list_images(
    include_loaded: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """List images. By default excludes already-loaded ones (use ?include_loaded=true to see all).
    Dedupes by filename (keeps the most recent row per filename)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT h.* FROM image_history h
               WHERE h.id = (
                   SELECT MAX(h2.id) FROM image_history h2 WHERE h2.filename = h.filename
               )
               ORDER BY h.created_at DESC"""
        )
        rows = [dict(r) for r in await cursor.fetchall()]
        if not include_loaded:
            rows = [r for r in rows if r.get("status") != "loaded"]
        return rows
    finally:
        await db.close()


@router.post("/{image_id}/load")
async def load_image_by_id(
    image_id: int,
    req: LoadRequest,
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM image_history WHERE id = ?", (image_id,))
        image_row = await cursor.fetchone()
        if image_row is None:
            raise HTTPException(status_code=404, detail="Image not found")
        image = dict(image_row)

        file_path = Path(settings.UPLOAD_DIR) / image["filename"]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File {image['filename']} not found on disk")

        nodes = []
        for node_id in req.node_ids:
            cursor = await db.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
            node = await cursor.fetchone()
            if node is None:
                raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
            nd = dict(node)
            # 로드 대화상자에서 입력한 비밀번호가 있으면 노드 저장값보다 우선.
            if req.sudo_password:
                nd["sudo_password"] = req.sudo_password
            nodes.append(nd)

        results = []
        for node in nodes:
            ssh = SSHService()
            try:
                result = ssh.load_image(str(file_path), node)
                results.append(result)
            except Exception as e:
                results.append({"status": "failed", "node": node["host"], "message": str(e)})

        target_nodes = ",".join(n["name"] for n in nodes)
        overall_status = "loaded" if all(r["status"] == "success" for r in results) else "partial_failure"

        await db.execute(
            "UPDATE image_history SET status = ?, target_nodes = ?, loaded_by = ? WHERE id = ?",
            (overall_status, target_nodes, current_user["username"], image_id),
        )
        await db.commit()
        return {"status": overall_status, "results": results}
    finally:
        await db.close()


@router.get("/applications")
async def list_applications(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT DISTINCT application FROM image_history WHERE application IS NOT NULL AND application != '' ORDER BY application"
        )
        rows = await cursor.fetchall()
        return [row[0] for row in rows]
    finally:
        await db.close()


@router.get("/history")
async def image_history(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM image_history ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.delete("/{image_id}")
async def delete_image(image_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT filename FROM image_history WHERE id = ?", (image_id,))
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Image history not found")

        file_path = Path(settings.UPLOAD_DIR) / row[0]
        if file_path.exists():
            os.unlink(file_path)

        await db.execute("DELETE FROM image_history WHERE id = ?", (image_id,))
        await db.commit()
        return {"message": "Deleted"}
    finally:
        await db.close()


@router.get("/node/{node_id}/list")
async def list_node_images(node_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        node_row = await cursor.fetchone()
        if node_row is None:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        node = dict(node_row)
    finally:
        await db.close()

    # Try K8s API first (works for any node in cluster, including masters,
    # and doesn't require SSH/sudo). Match by host or name.
    try:
        for candidate in (node.get("host"), node.get("name")):
            if not candidate:
                continue
            images = k8s_client.get_node_images(candidate)
            if images is not None:
                return images
    except Exception:
        pass  # fall back to SSH

    ssh = SSHService()
    errors = []
    runtime_available = False
    try:
        ssh.connect(
            host=node["host"],
            port=node.get("port", 22),
            username=node.get("username", "root"),
            key_path=node.get("ssh_key_path"),
            password=node.get("password"),
        )
        user = ssh.username

        # Try docker
        stdout, stderr, exit_code = ssh.execute_command(
            with_sudo("docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}} {{.CreatedAt}}'", user)
        )
        if exit_code == 0:
            runtime_available = True
            if stdout.strip():
                images = []
                for line in stdout.strip().splitlines():
                    parts = line.split(None, 3)
                    if len(parts) >= 3:
                        repo_tag = parts[0].split(":", 1)
                        images.append({
                            "repository": repo_tag[0],
                            "tag": repo_tag[1] if len(repo_tag) > 1 else "<none>",
                            "id": parts[1],
                            "size": parts[2],
                        })
                if images:
                    return images
        else:
            errors.append(f"docker: {(stderr or '').strip() or f'exit {exit_code}'}")

        # Try podman
        stdout, stderr, exit_code = ssh.execute_command(
            with_sudo("podman images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'", user)
        )
        if exit_code == 0:
            runtime_available = True
            if stdout.strip():
                images = []
                for line in stdout.strip().splitlines():
                    parts = line.split(None, 2)
                    if len(parts) >= 3:
                        repo_tag = parts[0].split(":", 1)
                        images.append({
                            "repository": repo_tag[0],
                            "tag": repo_tag[1] if len(repo_tag) > 1 else "<none>",
                            "id": parts[1],
                            "size": parts[2],
                        })
                if images:
                    return images
        else:
            errors.append(f"podman: {(stderr or '').strip() or f'exit {exit_code}'}")

        # Try crictl
        stdout, stderr, exit_code = ssh.execute_command(with_sudo("crictl images -o json", user))
        if exit_code == 0:
            runtime_available = True
            if stdout.strip():
                try:
                    data = json.loads(stdout)
                    images = []
                    for img in data.get("images", []):
                        repo_tags = img.get("repoTags", [])
                        repo_tag = repo_tags[0] if repo_tags else "<none>:<none>"
                        parts = repo_tag.split(":", 1)
                        images.append({
                            "repository": parts[0],
                            "tag": parts[1] if len(parts) > 1 else "<none>",
                            "id": img.get("id", ""),
                            "size": img.get("size", ""),
                        })
                    if images:
                        return images
                except json.JSONDecodeError as e:
                    errors.append(f"crictl JSON parse: {e}")
        else:
            errors.append(f"crictl: {(stderr or '').strip() or f'exit {exit_code}'}")

        # Try ctr
        stdout, stderr, exit_code = ssh.execute_command(with_sudo("ctr -n k8s.io images list", user))
        if exit_code == 0:
            runtime_available = True
            lines = stdout.strip().splitlines()
            images = []
            for line in lines[1:]:  # skip header
                parts = line.split()
                if len(parts) >= 4:
                    ref = parts[0]
                    ref_parts = ref.split(":", 1)
                    images.append({
                        "repository": ref_parts[0],
                        "tag": ref_parts[1] if len(ref_parts) > 1 else "<none>",
                        "id": parts[2] if len(parts) > 2 else "",
                        "size": parts[3] if len(parts) > 3 else "",
                    })
            if images:
                return images
        else:
            errors.append(f"ctr: {(stderr or '').strip() or f'exit {exit_code}'}")

        if runtime_available:
            return []

        raise HTTPException(
            status_code=500,
            detail=f"No container runtime accessible. Errors: {' | '.join(errors)}",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SSH/runtime error: {e}")
    finally:
        ssh.close()


@router.delete("/node/{node_id}/image")
async def delete_node_image(
    node_id: int,
    image_ref: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove an image from a node. image_ref is like 'repo:tag' or an image ID."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        node_row = await cursor.fetchone()
        if node_row is None:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        node = dict(node_row)
    finally:
        await db.close()

    ssh = SSHService()
    errors = []
    try:
        ssh.connect(
            host=node["host"],
            port=node.get("port", 22),
            username=node.get("username", "root"),
            key_path=node.get("ssh_key_path"),
            password=node.get("password"),
        )
        user = ssh.username

        attempts = [
            ("crictl", with_sudo(f"crictl rmi {image_ref}", user)),
            ("docker", with_sudo(f"docker rmi {image_ref}", user)),
            ("podman", with_sudo(f"podman rmi {image_ref}", user)),
            ("ctr", with_sudo(f"ctr -n k8s.io images rm {image_ref}", user)),
        ]
        for name, cmd in attempts:
            stdout, stderr, exit_code = ssh.execute_command(cmd)
            if exit_code == 0:
                return {
                    "status": "success",
                    "runtime": name,
                    "output": stdout.strip(),
                    "image_ref": image_ref,
                }
            errors.append(f"{name}: {(stderr or '').strip() or f'exit {exit_code}'}")

        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove image '{image_ref}'. Errors: {' | '.join(errors)}",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SSH/runtime error: {e}")
    finally:
        ssh.close()


@router.post("/replace")
async def replace_image(
    req: ReplaceRequest,
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM image_history WHERE id = ?", (req.image_id,))
        image_row = await cursor.fetchone()
        if image_row is None:
            raise HTTPException(status_code=404, detail="Image not found")
        image = dict(image_row)

        file_path = Path(settings.UPLOAD_DIR) / image["filename"]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File {image['filename']} not found on disk")

        nodes = []
        for node_id in req.node_ids:
            cursor = await db.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
            node = await cursor.fetchone()
            if node is None:
                raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
            nodes.append(dict(node))

        # Load image to all nodes
        load_results = []
        for node in nodes:
            ssh = SSHService()
            try:
                result = ssh.load_image(str(file_path), node)
                load_results.append(result)
            except Exception as e:
                load_results.append({"status": "failed", "node": node["host"], "message": str(e)})

        # Restart deployments if requested
        restart_results = []
        if req.restart_deployments:
            deployments = k8s_client.find_deployments_by_image(req.target_image)
            for dep in deployments:
                try:
                    result = k8s_client.rollout_restart_deployment(dep["name"], dep["namespace"])
                    restart_results.append(result)
                except Exception as e:
                    restart_results.append({
                        "status": "failed",
                        "message": f"Failed to restart {dep['namespace']}/{dep['name']}: {str(e)}",
                    })

        target_nodes = ",".join(n["name"] for n in nodes)
        overall_status = "loaded" if all(r["status"] == "success" for r in load_results) else "partial_failure"

        await db.execute(
            "UPDATE image_history SET status = ?, target_nodes = ?, loaded_by = ? WHERE id = ?",
            (overall_status, target_nodes, current_user["username"], req.image_id),
        )
        await db.commit()

        return {
            "status": overall_status,
            "load_results": load_results,
            "restart_results": restart_results,
        }
    finally:
        await db.close()
