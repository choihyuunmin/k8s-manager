"""exec_stream이 올바른 인자로 kubernetes exec 스트림을 여는지 검증.

실제 클러스터 없이 검증 가능한 순수 로직(인자 구성)만 다룬다.
실행: backend 디렉터리에서 `./venv/bin/python -m unittest tests.test_exec_stream`
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.k8s_client import K8sClient


class ExecStreamArgsTest(unittest.TestCase):
    def _run(self, container=None):
        c = K8sClient()
        fake_core = MagicMock()
        c._core_v1 = fake_core  # 설정 로드 우회
        with patch("services.k8s_client.stream") as fake_stream:
            fake_stream.return_value = "WSCLIENT"
            result = c.exec_stream("ns1", "pod1", container)
        return fake_core, fake_stream, result

    def test_returns_stream_result(self):
        _, _, result = self._run()
        self.assertEqual(result, "WSCLIENT")

    def test_calls_connect_exec_with_interactive_flags(self):
        fake_core, fake_stream, _ = self._run()
        args, kwargs = fake_stream.call_args
        # 첫 인자는 exec 호출 함수
        self.assertIs(args[0], fake_core.connect_get_namespaced_pod_exec)
        self.assertEqual(kwargs["name"], "pod1")
        self.assertEqual(kwargs["namespace"], "ns1")
        self.assertTrue(kwargs["stdin"])
        self.assertTrue(kwargs["stdout"])
        self.assertTrue(kwargs["stderr"])
        self.assertTrue(kwargs["tty"])
        self.assertFalse(kwargs["_preload_content"])

    def test_uses_bash_with_sh_fallback_command(self):
        _, fake_stream, _ = self._run()
        cmd = fake_stream.call_args.kwargs["command"]
        self.assertEqual(cmd[0], "/bin/sh")
        self.assertEqual(cmd[1], "-c")
        self.assertIn("/bin/bash", cmd[2])
        self.assertIn("/bin/sh", cmd[2])

    def test_omits_container_when_none(self):
        _, fake_stream, _ = self._run(container=None)
        self.assertNotIn("container", fake_stream.call_args.kwargs)

    def test_includes_container_when_given(self):
        _, fake_stream, _ = self._run(container="app")
        self.assertEqual(fake_stream.call_args.kwargs["container"], "app")


if __name__ == "__main__":
    unittest.main()
