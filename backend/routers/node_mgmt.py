from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.auth import get_current_user
from database import get_db
from services.ssh_service import SSHService

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class NodeCreate(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str = "root"
    auth_type: str = "key"
    ssh_key_path: Optional[str] = None
    password: Optional[str] = None
    sudo_password: Optional[str] = None


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    auth_type: Optional[str] = None
    ssh_key_path: Optional[str] = None
    password: Optional[str] = None
    sudo_password: Optional[str] = None


@router.get("")
async def list_nodes(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id, name, host, port, username, auth_type, ssh_key_path, created_at FROM nodes ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.post("")
async def create_node(req: NodeCreate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO nodes (name, host, port, username, auth_type, ssh_key_path, password, sudo_password, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (req.name, req.host, req.port, req.username, req.auth_type, req.ssh_key_path, req.password, req.sudo_password, now),
        )
        await db.commit()
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        return {"id": row[0], "message": "Node registered"}
    finally:
        await db.close()


@router.put("/{node_id}")
async def update_node(
    node_id: int,
    req: NodeUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM nodes WHERE id = ?", (node_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Node not found")

        fields = []
        params = []
        for field_name, value in req.model_dump(exclude_none=True).items():
            fields.append(f"{field_name} = ?")
            params.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        params.append(node_id)
        await db.execute(f"UPDATE nodes SET {', '.join(fields)} WHERE id = ?", params)
        await db.commit()
        return {"id": node_id, "message": "Updated"}
    finally:
        await db.close()


@router.delete("/{node_id}")
async def delete_node(node_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM nodes WHERE id = ?", (node_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Node not found")
        await db.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
        await db.commit()
        return {"message": "Deleted"}
    finally:
        await db.close()


@router.post("/{node_id}/test")
async def test_connection(node_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Node not found")
        node = dict(row)
    finally:
        await db.close()

    ssh = SSHService()
    try:
        ssh.connect(
            host=node["host"],
            port=node["port"],
            username=node["username"],
            key_path=node.get("ssh_key_path"),
            password=node.get("password"),
        )
        stdout, stderr, exit_code = ssh.execute_command("hostname")
        return {
            "status": "success",
            "hostname": stdout.strip(),
            "message": f"Connected to {node['host']}",
        }
    except Exception as e:
        return {"status": "failed", "message": str(e)}
    finally:
        ssh.close()
