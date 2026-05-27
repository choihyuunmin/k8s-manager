import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth.auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class PresetCreate(BaseModel):
    name: str
    filters_json: dict


@router.get("/query")
async def dashboard_query(
    namespace: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        results = {}

        deploy_query = "SELECT * FROM deploy_history WHERE 1=1"
        deploy_params = []
        if namespace:
            deploy_query += " AND namespace = ?"
            deploy_params.append(namespace)
        if resource_type:
            deploy_query += " AND resource_kind = ?"
            deploy_params.append(resource_type)
        if date_from:
            deploy_query += " AND created_at >= ?"
            deploy_params.append(date_from)
        if date_to:
            deploy_query += " AND created_at <= ?"
            deploy_params.append(date_to)
        deploy_query += " ORDER BY created_at DESC LIMIT 100"
        cursor = await db.execute(deploy_query, deploy_params)
        results["deploys"] = [dict(row) for row in await cursor.fetchall()]

        issue_query = "SELECT * FROM issues WHERE 1=1"
        issue_params = []
        if namespace:
            issue_query += " AND namespace = ?"
            issue_params.append(namespace)
        if status:
            issue_query += " AND status = ?"
            issue_params.append(status)
        if date_from:
            issue_query += " AND created_at >= ?"
            issue_params.append(date_from)
        if date_to:
            issue_query += " AND created_at <= ?"
            issue_params.append(date_to)
        issue_query += " ORDER BY created_at DESC LIMIT 100"
        cursor = await db.execute(issue_query, issue_params)
        results["issues"] = [dict(row) for row in await cursor.fetchall()]

        image_query = "SELECT * FROM image_history WHERE 1=1"
        image_params = []
        if date_from:
            image_query += " AND created_at >= ?"
            image_params.append(date_from)
        if date_to:
            image_query += " AND created_at <= ?"
            image_params.append(date_to)
        image_query += " ORDER BY created_at DESC LIMIT 100"
        cursor = await db.execute(image_query, image_params)
        results["images"] = [dict(row) for row in await cursor.fetchall()]

        return results
    finally:
        await db.close()


@router.get("/presets")
async def list_presets(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM dashboard_presets ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["filters_json"] = json.loads(d["filters_json"])
            result.append(d)
        return result
    finally:
        await db.close()


@router.post("/presets")
async def create_preset(req: PresetCreate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO dashboard_presets (name, filters_json, created_by, created_at) VALUES (?, ?, ?, ?)",
            (req.name, json.dumps(req.filters_json), current_user["username"], now),
        )
        await db.commit()
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        return {"id": row[0], "message": "Created"}
    finally:
        await db.close()


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM dashboard_presets WHERE id = ?", (preset_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Preset not found")
        await db.execute("DELETE FROM dashboard_presets WHERE id = ?", (preset_id,))
        await db.commit()
        return {"message": "Deleted"}
    finally:
        await db.close()


@router.get("/summary")
async def dashboard_summary(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT COUNT(*) FROM manifests")
        manifest_count = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM issues WHERE status = 'open'")
        open_issues = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM issues WHERE status = 'resolved'")
        resolved_issues = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM deploy_history")
        deploy_count = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM image_history")
        image_count = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM nodes")
        node_count = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT * FROM deploy_history ORDER BY created_at DESC LIMIT 5")
        recent_deploys = [dict(row) for row in await cursor.fetchall()]

        cursor = await db.execute("SELECT * FROM issues WHERE status = 'open' ORDER BY created_at DESC LIMIT 5")
        recent_issues = [dict(row) for row in await cursor.fetchall()]

        return {
            "manifests": manifest_count,
            "open_issues": open_issues,
            "resolved_issues": resolved_issues,
            "total_deploys": deploy_count,
            "total_images": image_count,
            "registered_nodes": node_count,
            "recent_deploys": recent_deploys,
            "recent_issues": recent_issues,
        }
    finally:
        await db.close()
