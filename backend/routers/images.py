import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from auth.auth import get_current_user
from config import settings
from database import get_db
from services.ssh_service import SSHService

router = APIRouter(prefix="/api/images", tags=["images"])


class LoadRequest(BaseModel):
    node_ids: list[int]


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO image_history (filename, status, loaded_by, created_at) VALUES (?, ?, ?, ?)",
            (file.filename, "uploaded", current_user["username"], now),
        )
        await db.commit()
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        return {"id": row[0], "filename": file.filename, "status": "uploaded", "size": len(content)}
    finally:
        await db.close()


@router.get("")
async def list_images(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM image_history ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
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
            nodes.append(dict(node))

        results = []
        for node in nodes:
            ssh = SSHService()
            try:
                result = ssh.load_image(str(file_path), node)
                results.append(result)
            except Exception as e:
                results.append({"status": "failed", "node": node["host"], "message": str(e)})

        target_nodes = ",".join(str(n) for n in req.node_ids)
        overall_status = "loaded" if all(r["status"] == "success" for r in results) else "partial_failure"
        now = datetime.now(timezone.utc).isoformat()

        await db.execute(
            """INSERT INTO image_history
               (filename, image_name, image_tag, target_nodes, status, loaded_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (image["filename"], image.get("image_name"), image.get("image_tag"),
             target_nodes, overall_status, current_user["username"], now),
        )
        await db.commit()
        return {"status": overall_status, "results": results}
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
