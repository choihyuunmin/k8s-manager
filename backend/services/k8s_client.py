from typing import Optional, Generator
from pathlib import Path

from kubernetes import client, config
from kubernetes.client.rest import ApiException

from config import settings


class K8sClient:
    def __init__(self):
        self._api_client: Optional[client.ApiClient] = None
        self._core_v1: Optional[client.CoreV1Api] = None
        self._apps_v1: Optional[client.AppsV1Api] = None

    def _load_config(self):
        kubeconfig = Path(settings.KUBECONFIG_PATH).expanduser()
        if not kubeconfig.exists():
            raise ConnectionError(f"Kubeconfig not found at {kubeconfig}")
        config.load_kube_config(config_file=str(kubeconfig))
        self._api_client = client.ApiClient()
        self._core_v1 = client.CoreV1Api(self._api_client)
        self._apps_v1 = client.AppsV1Api(self._api_client)

    @property
    def core_v1(self) -> client.CoreV1Api:
        if self._core_v1 is None:
            self._load_config()
        return self._core_v1

    @property
    def apps_v1(self) -> client.AppsV1Api:
        if self._apps_v1 is None:
            self._load_config()
        return self._apps_v1

    def list_nodes(self) -> list[dict]:
        nodes = self.core_v1.list_node()
        result = []
        for node in nodes.items:
            conditions = {c.type: c.status for c in (node.status.conditions or [])}
            allocatable = node.status.allocatable or {}
            capacity = node.status.capacity or {}
            result.append({
                "name": node.metadata.name,
                "status": "Ready" if conditions.get("Ready") == "True" else "NotReady",
                "roles": ",".join(
                    k.replace("node-role.kubernetes.io/", "")
                    for k in (node.metadata.labels or {})
                    if k.startswith("node-role.kubernetes.io/")
                ) or "worker",
                "internal_ip": next(
                    (a.address for a in (node.status.addresses or []) if a.type == "InternalIP"), ""
                ),
                "os_image": node.status.node_info.os_image if node.status.node_info else "",
                "kubelet_version": node.status.node_info.kubelet_version if node.status.node_info else "",
                "cpu_capacity": capacity.get("cpu", ""),
                "memory_capacity": capacity.get("memory", ""),
                "cpu_allocatable": allocatable.get("cpu", ""),
                "memory_allocatable": allocatable.get("memory", ""),
                "created_at": node.metadata.creation_timestamp.isoformat() if node.metadata.creation_timestamp else "",
            })
        return result

    def list_pods(self, namespace: Optional[str] = None) -> list[dict]:
        if namespace:
            pods = self.core_v1.list_namespaced_pod(namespace)
        else:
            pods = self.core_v1.list_pod_for_all_namespaces()
        result = []
        for pod in pods.items:
            container_statuses = pod.status.container_statuses or []
            ready = sum(1 for cs in container_statuses if cs.ready)
            total = len(container_statuses)
            restarts = sum(cs.restart_count for cs in container_statuses)
            result.append({
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": pod.status.phase,
                "ready": f"{ready}/{total}",
                "restarts": restarts,
                "node": pod.spec.node_name or "",
                "ip": pod.status.pod_ip or "",
                "created_at": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else "",
            })
        return result

    def list_services(self, namespace: Optional[str] = None) -> list[dict]:
        if namespace:
            services = self.core_v1.list_namespaced_service(namespace)
        else:
            services = self.core_v1.list_service_for_all_namespaces()
        result = []
        for svc in services.items:
            ports = [
                f"{p.port}/{p.protocol}" + (f" -> {p.node_port}" if p.node_port else "")
                for p in (svc.spec.ports or [])
            ]
            result.append({
                "name": svc.metadata.name,
                "namespace": svc.metadata.namespace,
                "type": svc.spec.type,
                "cluster_ip": svc.spec.cluster_ip or "",
                "ports": ", ".join(ports),
                "selector": svc.spec.selector or {},
                "created_at": svc.metadata.creation_timestamp.isoformat() if svc.metadata.creation_timestamp else "",
            })
        return result

    def list_deployments(self, namespace: Optional[str] = None) -> list[dict]:
        if namespace:
            deps = self.apps_v1.list_namespaced_deployment(namespace)
        else:
            deps = self.apps_v1.list_deployment_for_all_namespaces()
        result = []
        for dep in deps.items:
            result.append({
                "name": dep.metadata.name,
                "namespace": dep.metadata.namespace,
                "replicas": dep.spec.replicas or 0,
                "ready_replicas": dep.status.ready_replicas or 0,
                "available_replicas": dep.status.available_replicas or 0,
                "images": [
                    c.image for c in (dep.spec.template.spec.containers or [])
                ],
                "created_at": dep.metadata.creation_timestamp.isoformat() if dep.metadata.creation_timestamp else "",
            })
        return result

    def list_namespaces(self) -> list[dict]:
        ns_list = self.core_v1.list_namespace()
        return [
            {
                "name": ns.metadata.name,
                "status": ns.status.phase,
                "created_at": ns.metadata.creation_timestamp.isoformat() if ns.metadata.creation_timestamp else "",
            }
            for ns in ns_list.items
        ]

    def list_events(self, namespace: Optional[str] = None, limit: int = 50) -> list[dict]:
        if namespace:
            events = self.core_v1.list_namespaced_event(namespace, limit=limit)
        else:
            events = self.core_v1.list_event_for_all_namespaces(limit=limit)
        result = []
        for event in events.items:
            result.append({
                "type": event.type,
                "reason": event.reason,
                "message": event.message,
                "namespace": event.metadata.namespace,
                "involved_object": {
                    "kind": event.involved_object.kind if event.involved_object else "",
                    "name": event.involved_object.name if event.involved_object else "",
                },
                "count": event.count,
                "first_timestamp": event.first_timestamp.isoformat() if event.first_timestamp else "",
                "last_timestamp": event.last_timestamp.isoformat() if event.last_timestamp else "",
            })
        return result

    def get_cluster_overview(self) -> dict:
        nodes = self.core_v1.list_node()
        pods = self.core_v1.list_pod_for_all_namespaces()
        namespaces = self.core_v1.list_namespace()
        deployments = self.apps_v1.list_deployment_for_all_namespaces()

        ready_nodes = sum(
            1 for n in nodes.items
            if any(c.type == "Ready" and c.status == "True" for c in (n.status.conditions or []))
        )

        running_pods = sum(1 for p in pods.items if p.status.phase == "Running")

        return {
            "nodes": {"total": len(nodes.items), "ready": ready_nodes},
            "pods": {"total": len(pods.items), "running": running_pods},
            "namespaces": len(namespaces.items),
            "deployments": len(deployments.items),
        }

    def apply_manifest(self, yaml_content: str) -> dict:
        import yaml as pyyaml
        from kubernetes.utils import create_from_yaml
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            temp_path = f.name

        try:
            if self._api_client is None:
                self._load_config()
            create_from_yaml(self._api_client, temp_path)
            return {"status": "applied", "message": "Manifest applied successfully"}
        except Exception as e:
            error_msg = str(e)
            if "already exists" in error_msg.lower() or "AlreadyExists" in error_msg:
                return self._update_manifest(yaml_content)
            raise
        finally:
            os.unlink(temp_path)

    def _update_manifest(self, yaml_content: str) -> dict:
        import yaml as pyyaml
        docs = list(pyyaml.safe_load_all(yaml_content))
        for doc in docs:
            if not doc:
                continue
            kind = doc.get("kind", "")
            metadata = doc.get("metadata", {})
            name = metadata.get("name", "")
            namespace = metadata.get("namespace", "default")

            if kind == "Deployment":
                self.apps_v1.replace_namespaced_deployment(name, namespace, doc)
            elif kind == "Service":
                self.core_v1.replace_namespaced_service(name, namespace, doc)
            elif kind == "ConfigMap":
                self.core_v1.replace_namespaced_config_map(name, namespace, doc)
            elif kind == "Secret":
                self.core_v1.replace_namespaced_secret(name, namespace, doc)
            elif kind == "Namespace":
                self.core_v1.replace_namespace(name, doc)
            else:
                raise ValueError(f"Update not supported for kind: {kind}")

        return {"status": "updated", "message": "Manifest updated successfully"}

    def delete_resource(self, kind: str, name: str, namespace: str = "default") -> dict:
        kind_lower = kind.lower()
        if kind_lower == "deployment":
            self.apps_v1.delete_namespaced_deployment(name, namespace)
        elif kind_lower == "service":
            self.core_v1.delete_namespaced_service(name, namespace)
        elif kind_lower == "pod":
            self.core_v1.delete_namespaced_pod(name, namespace)
        elif kind_lower == "configmap":
            self.core_v1.delete_namespaced_config_map(name, namespace)
        elif kind_lower == "secret":
            self.core_v1.delete_namespaced_secret(name, namespace)
        elif kind_lower == "namespace":
            self.core_v1.delete_namespace(name)
        else:
            raise ValueError(f"Delete not supported for kind: {kind}")
        return {"status": "deleted", "message": f"{kind}/{name} deleted"}

    def get_pod_logs(
        self, namespace: str, pod: str, container: Optional[str] = None, tail_lines: int = 100
    ) -> str:
        kwargs = {"name": pod, "namespace": namespace, "tail_lines": tail_lines}
        if container:
            kwargs["container"] = container
        return self.core_v1.read_namespaced_pod_log(**kwargs)

    def stream_pod_logs(
        self, namespace: str, pod: str, container: Optional[str] = None
    ) -> Generator[str, None, None]:
        kwargs = {
            "name": pod,
            "namespace": namespace,
            "follow": True,
            "_preload_content": False,
        }
        if container:
            kwargs["container"] = container
        resp = self.core_v1.read_namespaced_pod_log(**kwargs)
        for line in resp:
            if isinstance(line, bytes):
                yield line.decode("utf-8", errors="replace")
            else:
                yield line

    def list_pod_containers(self, namespace: str, pod: str) -> list[dict]:
        pod_obj = self.core_v1.read_namespaced_pod(pod, namespace)
        containers = []
        for c in (pod_obj.spec.containers or []):
            containers.append({"name": c.name, "image": c.image, "type": "container"})
        for c in (pod_obj.spec.init_containers or []):
            containers.append({"name": c.name, "image": c.image, "type": "init_container"})
        return containers


k8s_client = K8sClient()
