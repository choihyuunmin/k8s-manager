from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from auth.auth import router as auth_router
from database import init_db
from routers.cluster import router as cluster_router
from routers.dashboard import router as dashboard_router
from routers.history import router as history_router
from routers.images import router as images_router
from routers.issues import router as issues_router
from routers.logs import router as logs_router
from routers.manifests import router as manifests_router
from routers.node_mgmt import router as node_mgmt_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="K8s Manager", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(cluster_router)
app.include_router(images_router)
app.include_router(manifests_router)
app.include_router(logs_router)
app.include_router(issues_router)
app.include_router(dashboard_router)
app.include_router(history_router)
app.include_router(node_mgmt_router)

static_dir = Path(__file__).parent / "static"
assets_dir = static_dir / "assets"
if assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.api_route("/{full_path:path}", methods=["GET"], include_in_schema=False)
async def spa_catch_all(request: Request, full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse(status_code=404, content={"detail": "Frontend not built"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
