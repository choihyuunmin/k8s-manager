from pathlib import Path
from typing import Optional, Tuple

import paramiko


class SSHService:
    def __init__(self):
        self._client: Optional[paramiko.SSHClient] = None

    def connect(
        self,
        host: str,
        port: int = 22,
        username: str = "root",
        key_path: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self._client = paramiko.SSHClient()
        self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        connect_kwargs = {"hostname": host, "port": port, "username": username, "timeout": 10}
        if key_path:
            expanded = Path(key_path).expanduser()
            connect_kwargs["key_filename"] = str(expanded)
        elif password:
            connect_kwargs["password"] = password
        else:
            default_keys = [Path("~/.ssh/id_rsa").expanduser(), Path("~/.ssh/id_ed25519").expanduser()]
            found = [str(k) for k in default_keys if k.exists()]
            if found:
                connect_kwargs["key_filename"] = found
            connect_kwargs["allow_agent"] = True
            connect_kwargs["look_for_keys"] = True

        self._client.connect(**connect_kwargs)

    def execute_command(self, command: str) -> Tuple[str, str, int]:
        if self._client is None:
            raise RuntimeError("SSH not connected")
        stdin, stdout, stderr = self._client.exec_command(command, timeout=300)
        exit_code = stdout.channel.recv_exit_status()
        return stdout.read().decode("utf-8"), stderr.read().decode("utf-8"), exit_code

    def upload_file(self, local_path: str, remote_path: str):
        if self._client is None:
            raise RuntimeError("SSH not connected")
        sftp = self._client.open_sftp()
        try:
            sftp.put(local_path, remote_path)
        finally:
            sftp.close()

    def load_image(self, local_tar_path: str, node_info: dict) -> dict:
        self.connect(
            host=node_info["host"],
            port=node_info.get("port", 22),
            username=node_info.get("username", "root"),
            key_path=node_info.get("ssh_key_path"),
            password=node_info.get("password"),
        )

        filename = Path(local_tar_path).name
        remote_path = f"/tmp/{filename}"

        try:
            self.upload_file(local_tar_path, remote_path)

            for cmd in [
                f"docker load -i {remote_path}",
                f"ctr -n k8s.io images import {remote_path}",
                f"crictl load {remote_path}",
            ]:
                stdout, stderr, exit_code = self.execute_command(cmd)
                if exit_code == 0:
                    self.execute_command(f"rm -f {remote_path}")
                    return {
                        "status": "success",
                        "command": cmd,
                        "output": stdout.strip(),
                        "node": node_info["host"],
                    }

            return {
                "status": "failed",
                "message": "No container runtime found (tried docker, containerd, crictl)",
                "node": node_info["host"],
            }
        finally:
            self.close()

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
