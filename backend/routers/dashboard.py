import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth.auth import get_current_user
from database import get_db
from services.k8s_client import k8s_client

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


@router.get("/metrics")
async def dashboard_metrics(
    namespace: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Aggregated cluster metrics for the live monitoring dashboard."""
    try:
        if namespace:
            pods = k8s_client.list_pods(namespace)
            deployments = k8s_client.list_deployments(namespace)
        else:
            pods = k8s_client.list_pods()
            deployments = k8s_client.list_deployments()
        nodes = k8s_client.list_nodes()
        events = k8s_client.list_events(namespace, limit=30)

        # Pod status distribution
        status_count: dict[str, int] = {}
        for p in pods:
            status_count[p["status"]] = status_count.get(p["status"], 0) + 1
        pod_status = [{"name": k, "value": v} for k, v in status_count.items()]

        # Pods per namespace
        ns_count: dict[str, int] = {}
        for p in pods:
            ns_count[p["namespace"]] = ns_count.get(p["namespace"], 0) + 1
        pods_by_ns = sorted(
            [{"name": k, "value": v} for k, v in ns_count.items()],
            key=lambda x: x["value"], reverse=True,
        )[:10]

        # Top restarting pods
        top_restarts = sorted(
            [{"name": f"{p['namespace']}/{p['name']}", "value": p["restarts"]} for p in pods if p["restarts"] > 0],
            key=lambda x: x["value"], reverse=True,
        )[:8]

        # Deployment health (ready vs desired)
        deploy_health = []
        unhealthy = 0
        healthy = 0
        for d in deployments:
            desired = d.get("replicas", 0) or 0
            ready = d.get("ready_replicas", 0) or 0
            if desired > 0 and ready >= desired:
                healthy += 1
            else:
                unhealthy += 1
                deploy_health.append({
                    "name": f"{d['namespace']}/{d['name']}",
                    "ready": ready,
                    "desired": desired,
                })
        deploy_health = sorted(deploy_health, key=lambda x: x["desired"] - x["ready"], reverse=True)[:8]
        deploy_summary = [
            {"name": "Healthy", "value": healthy},
            {"name": "Unhealthy", "value": unhealthy},
        ]

        # Node status
        node_status = []
        for n in nodes:
            node_status.append({"name": n["name"], "status": n["status"], "roles": n["roles"]})

        # Recent events
        recent_events = []
        for e in events[:15]:
            recent_events.append({
                "type": e["type"],
                "reason": e["reason"],
                "message": e["message"],
                "namespace": e["namespace"],
                "involved": f"{e['involved_object'].get('kind', '')}/{e['involved_object'].get('name', '')}",
                "last": e["last_timestamp"],
            })

        return {
            "totals": {
                "nodes": len(nodes),
                "pods": len(pods),
                "deployments": len(deployments),
                "running_pods": sum(1 for p in pods if p["status"] == "Running"),
            },
            "pod_status": pod_status,
            "pods_by_namespace": pods_by_ns,
            "top_restarts": top_restarts,
            "deploy_health": deploy_health,
            "deploy_summary": deploy_summary,
            "node_status": node_status,
            "recent_events": recent_events,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"K8s cluster unavailable: {e}")


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
