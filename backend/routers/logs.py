import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from auth.auth import get_current_user, verify_token
from services.k8s_client import k8s_client

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.websocket("/stream/{namespace}/{pod}")
async def stream_logs(
    websocket: WebSocket,
    namespace: str,
    pod: str,
    container: Optional[str] = None,
):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    try:
        log_gen = k8s_client.stream_pod_logs(namespace, pod, container)
        for line in log_gen:
            await websocket.send_text(line)
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"[ERROR] {str(e)}")
            await websocket.close()
        except Exception:
            pass


@router.get("/pods/{namespace}")
async def list_pods_in_namespace(
    namespace: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        pods = k8s_client.list_pods(namespace)
        return [p["name"] for p in pods]
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{namespace}/{pod}")
async def get_pod_logs(
    namespace: str,
    pod: str,
    container: Optional[str] = Query(None),
    tail_lines: int = Query(100, ge=1, le=10000),
    current_user: dict = Depends(get_current_user),
):
    try:
        logs = k8s_client.get_pod_logs(namespace, pod, container, tail_lines)
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/containers/{namespace}/{pod}")
async def list_containers(
    namespace: str,
    pod: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        return k8s_client.list_pod_containers(namespace, pod)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
