from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.auth import get_current_user
from services.k8s_client import k8s_client

router = APIRouter(prefix="/api/cluster", tags=["cluster"])


def _k8s_error_response(e: Exception) -> dict:
    return {"error": True, "message": f"K8s cluster unavailable: {str(e)}"}


@router.get("/overview")
async def cluster_overview(current_user: dict = Depends(get_current_user)):
    try:
        return k8s_client.get_cluster_overview()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/nodes")
async def list_nodes(current_user: dict = Depends(get_current_user)):
    try:
        return k8s_client.list_nodes()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/pods")
async def list_pods(
    namespace: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        return k8s_client.list_pods(namespace)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/services")
async def list_services(
    namespace: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        return k8s_client.list_services(namespace)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/deployments")
async def list_deployments(
    namespace: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        return k8s_client.list_deployments(namespace)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/namespaces")
async def list_namespaces(current_user: dict = Depends(get_current_user)):
    try:
        return k8s_client.list_namespaces()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/summary")
async def cluster_summary(current_user: dict = Depends(get_current_user)):
    try:
        overview = k8s_client.get_cluster_overview()
        services = k8s_client.list_services()
        return {
            "nodes": overview["nodes"]["total"],
            "pods": overview["pods"]["total"],
            "deployments": overview["deployments"],
            "services": len(services),
        }
    except Exception:
        return {"nodes": 0, "pods": 0, "deployments": 0, "services": 0}


@router.get("/events")
async def list_events(
    namespace: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    try:
        return k8s_client.list_events(namespace, limit)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
