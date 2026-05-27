from datetime import datetime, timezone
from typing import Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.auth import get_current_user
from database import get_db
from services.k8s_client import k8s_client

router = APIRouter(prefix="/api/manifests", tags=["manifests"])


class ManifestCreate(BaseModel):
    name: str
    namespace: str = "default"
    kind: str
    content_yaml: str


class ManifestUpdate(BaseModel):
    name: Optional[str] = None
    namespace: Optional[str] = None
    kind: Optional[str] = None
    content_yaml: Optional[str] = None


class ValidateRequest(BaseModel):
    content_yaml: str


class TemplateRequest(BaseModel):
    kind: str
    name: str = "example"
    namespace: str = "default"


TEMPLATES = {
    "Deployment": """apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
  namespace: {namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {name}
  template:
    metadata:
      labels:
        app: {name}
    spec:
      containers:
      - name: {name}
        image: nginx:latest
        ports:
        - containerPort: 80
""",
    "Service": """apiVersion: v1
kind: Service
metadata:
  name: {name}
  namespace: {namespace}
spec:
  selector:
    app: {name}
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
""",
    "ConfigMap": """apiVersion: v1
kind: ConfigMap
metadata:
  name: {name}
  namespace: {namespace}
data:
  key1: value1
""",
    "Secret": """apiVersion: v1
kind: Secret
metadata:
  name: {name}
  namespace: {namespace}
type: Opaque
stringData:
  key1: value1
""",
    "Ingress": """apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {name}
  namespace: {namespace}
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: {name}
            port:
              number: 80
""",
    "PersistentVolumeClaim": """apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {name}
  namespace: {namespace}
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
""",
    "CronJob": """apiVersion: batch/v1
kind: CronJob
metadata:
  name: {name}
  namespace: {namespace}
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: {name}
            image: busybox
            command: ["echo", "hello"]
          restartPolicy: OnFailure
""",
    "Job": """apiVersion: batch/v1
kind: Job
metadata:
  name: {name}
  namespace: {namespace}
spec:
  template:
    spec:
      containers:
      - name: {name}
        image: busybox
        command: ["echo", "hello"]
      restartPolicy: Never
""",
    "Namespace": """apiVersion: v1
kind: Namespace
metadata:
  name: {name}
""",
    "StatefulSet": """apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {name}
  namespace: {namespace}
spec:
  serviceName: {name}
  replicas: 1
  selector:
    matchLabels:
      app: {name}
  template:
    metadata:
      labels:
        app: {name}
    spec:
      containers:
      - name: {name}
        image: nginx:latest
        ports:
        - containerPort: 80
""",
    "DaemonSet": """apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: {name}
  namespace: {namespace}
spec:
  selector:
    matchLabels:
      app: {name}
  template:
    metadata:
      labels:
        app: {name}
    spec:
      containers:
      - name: {name}
        image: nginx:latest
""",
}


@router.get("")
async def list_manifests(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM manifests ORDER BY updated_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.get("/{manifest_id}")
async def get_manifest(manifest_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM manifests WHERE id = ?", (manifest_id,))
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Manifest not found")
        return dict(row)
    finally:
        await db.close()


@router.post("")
async def create_manifest(req: ManifestCreate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO manifests (name, namespace, kind, content_yaml, version, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, ?, ?, ?)""",
            (req.name, req.namespace, req.kind, req.content_yaml, current_user["username"], now, now),
        )
        await db.commit()
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        return {"id": row[0], "message": "Created"}
    finally:
        await db.close()


@router.put("/{manifest_id}")
async def update_manifest(
    manifest_id: int,
    req: ManifestUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM manifests WHERE id = ?", (manifest_id,))
        existing = await cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Manifest not found")
        existing = dict(existing)

        await db.execute(
            "INSERT INTO manifest_versions (manifest_id, version, content_yaml, updated_by, created_at) VALUES (?, ?, ?, ?, ?)",
            (manifest_id, existing["version"], existing["content_yaml"], existing["updated_by"], existing["updated_at"]),
        )

        now = datetime.now(timezone.utc).isoformat()
        new_version = existing["version"] + 1
        await db.execute(
            """UPDATE manifests SET
               name = COALESCE(?, name),
               namespace = COALESCE(?, namespace),
               kind = COALESCE(?, kind),
               content_yaml = COALESCE(?, content_yaml),
               version = ?,
               updated_by = ?,
               updated_at = ?
               WHERE id = ?""",
            (req.name, req.namespace, req.kind, req.content_yaml, new_version, current_user["username"], now, manifest_id),
        )
        await db.commit()
        return {"id": manifest_id, "version": new_version, "message": "Updated"}
    finally:
        await db.close()


@router.delete("/{manifest_id}")
async def delete_manifest(manifest_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM manifests WHERE id = ?", (manifest_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Manifest not found")
        await db.execute("DELETE FROM manifest_versions WHERE manifest_id = ?", (manifest_id,))
        await db.execute("DELETE FROM manifests WHERE id = ?", (manifest_id,))
        await db.commit()
        return {"message": "Deleted"}
    finally:
        await db.close()


@router.post("/{manifest_id}/apply")
async def apply_manifest(manifest_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM manifests WHERE id = ?", (manifest_id,))
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Manifest not found")
        manifest = dict(row)

        try:
            result = k8s_client.apply_manifest(manifest["content_yaml"])
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to apply manifest: {str(e)}")

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """INSERT INTO deploy_history
               (action_type, resource_kind, resource_name, namespace, manifest_id, after_yaml, deployed_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("apply", manifest["kind"], manifest["name"], manifest["namespace"],
             manifest_id, manifest["content_yaml"], current_user["username"], now),
        )
        await db.commit()
        return result
    finally:
        await db.close()


@router.get("/{manifest_id}/versions")
async def list_versions(manifest_id: int, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM manifest_versions WHERE manifest_id = ? ORDER BY version DESC",
            (manifest_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.post("/validate")
async def validate_yaml(req: ValidateRequest, current_user: dict = Depends(get_current_user)):
    try:
        docs = list(yaml.safe_load_all(req.content_yaml))
        valid_docs = [d for d in docs if d is not None]
        if not valid_docs:
            return {"valid": False, "error": "Empty YAML document"}
        return {"valid": True, "documents": len(valid_docs)}
    except yaml.YAMLError as e:
        return {"valid": False, "error": str(e)}


@router.post("/template")
async def generate_template(req: TemplateRequest, current_user: dict = Depends(get_current_user)):
    template = TEMPLATES.get(req.kind)
    if template is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown kind: {req.kind}. Available: {', '.join(TEMPLATES.keys())}",
        )
    return {"content_yaml": template.format(name=req.name, namespace=req.namespace)}
