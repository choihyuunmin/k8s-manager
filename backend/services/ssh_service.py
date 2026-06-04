from pathlib import Path
from typing import Optional, Tuple

import paramiko


def with_sudo(cmd: str, username: Optional[str], sudo_password: Optional[str] = None) -> str:
    """root 가 아니면 sudo 를 붙인다.

    - sudo_password 가 있으면 `sudo -S -p '' ...` (암호를 표준입력으로 받음).
    - 없으면 `sudo -n ...` (무인 모드, NOPASSWD sudoers 전제 — 기존 동작).
    """
    if username and username != "root":
        if sudo_password:
            return f"sudo -S -p '' {cmd}"
        return f"sudo -n {cmd}"
    return cmd


class SSHService:
    def __init__(self):
        self._client: Optional[paramiko.SSHClient] = None
        self._username: Optional[str] = None

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
        self._username = username

    @property
    def username(self) -> Optional[str]:
        return self._username

    def execute_command(self, command: str, stdin_input: Optional[str] = None) -> Tuple[str, str, int]:
        if self._client is None:
            raise RuntimeError("SSH not connected")
        stdin, stdout, stderr = self._client.exec_command(command, timeout=300)
        if stdin_input is not None:
            # `sudo -S` 용: 암호를 표준입력으로 전달한 뒤 닫는다.
            try:
                stdin.write(stdin_input + "\n")
                stdin.flush()
                stdin.channel.shutdown_write()
            except Exception:
                pass
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

            user = self._username
            sudo_pw = node_info.get("sudo_password") or None
            # sudo -S 를 쓸 때만 암호를 표준입력으로 전달한다(root 면 sudo 자체를 안 씀).
            stdin_pw = sudo_pw if (user and user != "root" and sudo_pw) else None
            # NOTE: `crictl` has no `load` subcommand. The runtimes that can import a tar archive are:
            # - podman (default storage shared with CRI-O on most RHEL/CentOS/Rocky distros)
            # - ctr  (containerd runtime, requires -n k8s.io to populate kubelet's namespace)
            # - docker (legacy)
            attempts = [
                ("podman", with_sudo(f"podman load -i {remote_path}", user, sudo_pw)),
                ("ctr",    with_sudo(f"ctr -n k8s.io images import {remote_path}", user, sudo_pw)),
                ("docker", with_sudo(f"docker load -i {remote_path}", user, sudo_pw)),
            ]
            errors = []
            for name, cmd in attempts:
                stdout, stderr, exit_code = self.execute_command(cmd, stdin_input=stdin_pw)
                if exit_code == 0:
                    self.execute_command(f"rm -f {remote_path}")
                    return {
                        "status": "success",
                        "runtime": name,
                        "command": cmd,
                        "output": stdout.strip(),
                        "node": node_info["host"],
                    }
                errors.append(f"{name}: {(stderr or '').strip() or stdout.strip() or f'exit {exit_code}'}")

            # Clean up the uploaded tar even on failure
            self.execute_command(f"rm -f {remote_path}")
            return {
                "status": "failed",
                "message": "Image load failed. " + " | ".join(errors),
                "node": node_info["host"],
            }
        finally:
            self.close()

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
