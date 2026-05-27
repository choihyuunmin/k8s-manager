from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth.auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def combined_history(
    action_type: Optional[str] = Query(None),
    resource_kind: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        deploy_where = "1=1"
        deploy_params: list = []
        if action_type and action_type != "image":
            deploy_where += " AND action_type = ?"
            deploy_params.append(action_type)
        if resource_kind:
            deploy_where += " AND resource_kind = ?"
            deploy_params.append(resource_kind)
        if date_from:
            deploy_where += " AND created_at >= ?"
            deploy_params.append(date_from)
        if date_to:
            deploy_where += " AND created_at <= ?"
            deploy_params.append(date_to)

        image_where = "1=1"
        image_params: list = []
        if action_type and action_type != "image":
            image_where += " AND 0"
        if date_from:
            image_where += " AND created_at >= ?"
            image_params.append(date_from)
        if date_to:
            image_where += " AND created_at <= ?"
            image_params.append(date_to)

        query = f"""
            SELECT id, action_type as type, resource_kind, resource_name, namespace,
                   deployed_by as performed_by, created_at, 'deploy' as source
            FROM deploy_history WHERE {deploy_where}
            UNION ALL
            SELECT id, status as type, 'image' as resource_kind, filename as resource_name, NULL as namespace,
                   loaded_by as performed_by, created_at, 'image' as source
            FROM image_history WHERE {image_where}
            ORDER BY created_at DESC LIMIT ?
        """
        all_params = deploy_params + image_params + [limit]
        cursor = await db.execute(query, all_params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.get("/deploys")
async def deploy_history(
    namespace: Optional[str] = Query(None),
    resource_kind: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        query = "SELECT * FROM deploy_history WHERE 1=1"
        params = []
        if namespace:
            query += " AND namespace = ?"
            params.append(namespace)
        if resource_kind:
            query += " AND resource_kind = ?"
            params.append(resource_kind)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.get("/images")
async def image_history(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        query = "SELECT * FROM image_history WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()
