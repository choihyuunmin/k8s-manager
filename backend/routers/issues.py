from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth.auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/issues", tags=["issues"])


class IssueCreate(BaseModel):
    title: str
    description: Optional[str] = None
    resource: Optional[str] = None
    severity: str = "medium"


class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    resource: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None


@router.get("")
async def list_issues(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    namespace: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        query = "SELECT * FROM issues WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        if namespace:
            query += " AND namespace = ?"
            params.append(namespace)
        query += " ORDER BY created_at DESC"
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            rt = d.get("resource_type") or ""
            rn = d.get("resource_name") or ""
            d["resource"] = f"{rt}/{rn}" if rt or rn else ""
            result.append(d)
        return result
    finally:
        await db.close()


def _parse_resource(resource: Optional[str]):
    if not resource:
        return None, None
    parts = resource.split("/", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None, parts[0]


@router.post("")
async def create_issue(req: IssueCreate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    resource_type, resource_name = _parse_resource(req.resource)
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO issues
               (title, description, resource_type, resource_name, namespace, severity, status, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)""",
            (req.title, req.description, resource_type, resource_name,
             None, req.severity, current_user["username"], now),
        )
        await db.commit()
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        return {"id": row[0], "message": "Created"}
    finally:
        await db.close()


@router.put("/{issue_id}")
async def update_issue(
    issue_id: int,
    req: IssueUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM issues WHERE id = ?", (issue_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Issue not found")

        fields = []
        params = []
        data = req.model_dump(exclude_none=True)
        if "resource" in data:
            rt, rn = _parse_resource(data.pop("resource"))
            fields.append("resource_type = ?")
            params.append(rt)
            fields.append("resource_name = ?")
            params.append(rn)
        for field_name, value in data.items():
            fields.append(f"{field_name} = ?")
            params.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        params.append(issue_id)
        await db.execute(f"UPDATE issues SET {', '.join(fields)} WHERE id = ?", params)
        await db.commit()
        return {"id": issue_id, "message": "Updated"}
    finally:
        await db.close()


@router.delete("/{issue_id}")
async def delete_issue(issue_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM issues WHERE id = ?", (issue_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Issue not found")
        await db.execute("DELETE FROM issues WHERE id = ?", (issue_id,))
        await db.commit()
        return {"message": "Deleted"}
    finally:
        await db.close()


@router.patch("/{issue_id}/resolve")
async def resolve_issue(issue_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM issues WHERE id = ?", (issue_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Issue not found")
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE issues SET status = 'resolved', resolved_at = ? WHERE id = ?",
            (now, issue_id),
        )
        await db.commit()
        return {"id": issue_id, "status": "resolved", "resolved_at": now}
    finally:
        await db.close()
