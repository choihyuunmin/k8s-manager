import asyncio
import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from auth.auth import verify_token
from services.k8s_client import k8s_client

router = APIRouter(prefix="/api/exec", tags=["exec"])

# kubernetes exec 프로토콜의 터미널 리사이즈 채널
RESIZE_CHANNEL = 4


@router.websocket("/{namespace}/{pod}")
async def exec_pod(
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
        wsclient = await asyncio.to_thread(k8s_client.exec_stream, namespace, pod, container)
    except Exception as e:
        await websocket.send_text(f"[ERROR] exec 시작 실패: {e}")
        await websocket.close()
        return

    async def to_browser():
        # 파드 stdout/stderr → 브라우저
        while wsclient.is_open():
            await asyncio.to_thread(wsclient.update, 1)
            if wsclient.peek_stdout():
                await websocket.send_text(wsclient.read_stdout())
            if wsclient.peek_stderr():
                await websocket.send_text(wsclient.read_stderr())
            await asyncio.sleep(0)

    async def to_pod():
        # 브라우저 입력 → 파드 stdin (resize 제어 메시지는 분기)
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if isinstance(msg, dict) and msg.get("type") == "resize":
                    wsclient.write_channel(
                        RESIZE_CHANNEL,
                        json.dumps({"Width": msg["cols"], "Height": msg["rows"]}),
                    )
                    continue
            except (ValueError, KeyError, TypeError):
                pass
            wsclient.write_stdin(data)

    tasks = [asyncio.create_task(to_browser()), asyncio.create_task(to_pod())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        for t in tasks:
            t.cancel()
        try:
            wsclient.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
