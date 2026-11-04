from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
TUNNEL_ID = "tunnel_0123456789abcdef0123456789abcdef"
SECRET = "fake-test-key-not-a-real-credential"


@unittest.skipUnless(sys.platform.startswith("linux"), "Linux bridge wrappers")
class BridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        helper = ROOT / "scripts/chatgpt_bridge.py"
        self.assertTrue(helper.exists(), "Linux bridge helper exists")
        spec = importlib.util.spec_from_file_location("chatgpt_bridge", helper)
        self.bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.bridge)
        self.temp = tempfile.TemporaryDirectory(
            prefix="sidkick-bridge-", dir="/tmp/opencode" if Path("/tmp/opencode").is_dir() else None,
        )
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo with spaces and 'quotes'"
        self.root.mkdir()
        self.bridge.ROOT = self.root
        self.runtime = self.root / ".sidkick"
        self.runtime.mkdir(mode=0o700)
        self.key = self.runtime / "tunnel-runtime-key.txt"
        self.key.write_text(SECRET)
        self.key.chmod(0o600)
        (self.runtime / "tunnel-id").write_text(TUNNEL_ID)
        self.python = self.root / "civ7/.venv/bin/python"
        self.python.parent.mkdir(parents=True)
        self.python.write_text("#!/bin/sh\nexit 0\n")
        self.python.chmod(0o700)
        self.client = self.root / "tools/tunnel-client/bin/tunnel-client"
        self.client.parent.mkdir(parents=True)
        self.client.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['FAKE_CLIENT_LOG'], 'a') as log:
    log.write(json.dumps({'args': args, 'cwd': os.getcwd(), 'state': os.environ.get('TUNNEL_CLIENT_STATE_DIR')}) + '\\n')
if os.environ.get('FAKE_FAIL') == args[1]:
    print('fake-test-key-not-a-real-credential', file=sys.stderr)
    sys.exit(12)
if args[1] == 'status':
    ready = os.environ.get('FAKE_READY', '1') == '1'
    print(json.dumps({'process_running': True, 'healthy': ready, 'ready': ready, 'unrelated': 'do not print'}))
''')
        self.client.chmod(0o700)
        self.log = Path(self.temp.name) / "calls.jsonl"
        self.environment = patch.dict(os.environ, {
            "FAKE_CLIENT_LOG": str(self.log), "FAKE_READY": "1", "FAKE_FAIL": "",
            "TUNNEL_CLIENT_STATE_DIR": "/must-not-use-global-state",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def invoke(self, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = self.bridge.main(list(args))
        return code, stdout.getvalue(), stderr.getvalue()

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_start_uses_managed_stdio_and_repo_scoped_state(self) -> None:
        code, out, err = self.invoke("start")
        self.assertEqual((code, err), (0, ""))
        self.assertIn("ready", out)
        connect, status = self.calls()
        args = connect["args"]
        self.assertEqual(args[:2], ["runtimes", "connect"])
        self.assertEqual(args[args.index("--alias") + 1], "sidkick")
        self.assertEqual(args[args.index("--tunnel-id") + 1], TUNNEL_ID)
        self.assertEqual(args[args.index("--runtime-api-key") + 1], f"file:{self.key}")
        self.assertEqual(shlex.split(args[args.index("--mcp-command") + 1]),
                         [str(self.python), str(self.root / "civ7/player.py"), "--mcp"])
        self.assertEqual(connect["cwd"], str(self.root))
        self.assertEqual(connect["state"], str(self.runtime / "linux-runtime"))
        self.assertEqual(status["args"], ["runtimes", "status", "sidkick", "--json"])
        self.assertNotIn(SECRET, json.dumps(self.calls()) + out + err)

    def test_stop_does_not_require_python_or_credentials(self) -> None:
        self.python.unlink()
        self.key.unlink()
        code, out, err = self.invoke("stop")
        self.assertEqual((code, err), (0, ""))
        self.assertIn("stopped", out)
        self.assertEqual(self.calls()[0]["args"], ["runtimes", "stop", "sidkick"])

    def test_status_is_read_only_and_reports_not_ready_as_failure(self) -> None:
        with patch.dict(os.environ, {"FAKE_READY": "0"}):
            code, out, err = self.invoke("status")
        self.assertEqual(code, 1)
        self.assertIn("not ready", out)
        self.assertNotIn("unrelated", out)
        self.assertEqual(self.calls()[0]["args"], ["runtimes", "status", "sidkick", "--json"])

    def test_unhealthy_connect_is_not_reported_as_success(self) -> None:
        with patch.dict(os.environ, {"FAKE_READY": "0"}):
            code, out, err = self.invoke("start")
        self.assertEqual(code, 1)
        self.assertIn("not ready", out)

    def test_configure_prompts_for_secret_and_creates_private_files(self) -> None:
        self.key.unlink()
        self.runtime.chmod(0o755)
        with patch.object(self.bridge.getpass, "getpass", return_value=SECRET) as prompt:
            code, out, err = self.invoke("configure", TUNNEL_ID)
        self.assertEqual((code, err), (0, ""))
        prompt.assert_called_once()
        self.assertEqual(self.key.read_text(), SECRET)
        self.assertEqual(self.key.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.runtime / "profiles").stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.runtime / "tunnel-id").read_text().strip(), TUNNEL_ID)
        self.assertNotIn(SECRET, json.dumps(self.calls()) + out + err)

    def test_configure_reuses_key_unless_replacement_is_requested(self) -> None:
        with patch.object(self.bridge.getpass, "getpass", return_value="replacement") as prompt:
            self.assertEqual(self.invoke("configure", TUNNEL_ID)[0], 0)
            prompt.assert_not_called()
            self.assertEqual(self.key.read_text(), SECRET)
            self.assertEqual(self.invoke("configure", TUNNEL_ID, "--replace-key")[0], 0)
            prompt.assert_called_once()
            self.assertEqual(self.key.read_text(), "replacement")

    def test_rejects_invalid_tunnel_id_without_calling_client(self) -> None:
        code, out, err = self.invoke("configure", "not-a-tunnel")
        self.assertEqual(code, 1)
        self.assertIn("tunnel ID", err)
        self.assertEqual(self.calls(), [])

    def test_accepts_namespaced_tunnel_id(self) -> None:
        namespaced = "tunnel_ab12_0123456789abcdef0123456789abcdef"
        self.assertEqual(self.invoke("configure", namespaced)[0], 0)
        self.assertIn(namespaced, self.calls()[0]["args"])

    def test_start_rejects_missing_setup_or_insecure_key(self) -> None:
        tunnel_file = self.runtime / "tunnel-id"
        tunnel_file.unlink()
        self.assertEqual(self.invoke("start")[0], 1)
        tunnel_file.write_text(TUNNEL_ID)
        self.key.chmod(0o644)
        self.assertEqual(self.invoke("start")[0], 1)
        self.assertEqual(self.calls(), [])

    def test_configure_refuses_symlink_key(self) -> None:
        other = self.root / "do-not-overwrite"
        other.write_text("preserve me")
        self.key.unlink()
        self.key.symlink_to(other)
        code, out, err = self.invoke("configure", TUNNEL_ID, "--replace-key")
        self.assertEqual(code, 1)
        self.assertEqual(other.read_text(), "preserve me")
        self.assertEqual(self.calls(), [])

    def test_configure_never_falls_back_to_echoing_the_key(self) -> None:
        self.key.unlink()
        with patch.object(self.bridge.getpass, "getpass", side_effect=self.bridge.getpass.GetPassWarning("No secure terminal")):
            code, out, err = self.invoke("configure", TUNNEL_ID)
        self.assertEqual(code, 1)
        self.assertFalse(self.key.exists())
        self.assertEqual(self.calls(), [])

    def test_start_refuses_an_insecure_secret_directory(self) -> None:
        self.runtime.chmod(0o777)
        code, out, err = self.invoke("start")
        self.assertEqual(code, 1)
        self.assertEqual(self.calls(), [])

    def test_client_failure_propagates_without_printing_credentials(self) -> None:
        with patch.dict(os.environ, {"FAKE_FAIL": "connect"}):
            code, out, err = self.invoke("start")
        self.assertEqual(code, 1)
        self.assertIn("12", err)
        self.assertNotIn(SECRET, out + err)
        self.assertEqual(len(self.calls()), 1)

    def test_missing_client_has_actionable_error(self) -> None:
        self.client.unlink()
        code, out, err = self.invoke("start")
        self.assertEqual(code, 1)
        self.assertIn("tunnel-client", err)
        self.assertEqual(self.calls(), [])

    def test_shell_wrappers_work_outside_repo_and_preserve_arguments(self) -> None:
        (self.root / "scripts").mkdir()
        shutil.copy(ROOT / "scripts/chatgpt_bridge.py", self.root / "scripts/chatgpt_bridge.py")
        for filename in ("start-sidkick.sh", "stop-sidkick.sh", "sidkick-status.sh"):
            with self.subTest(filename=filename):
                wrapper = self.root / filename
                self.assertTrue((ROOT / filename).exists())
                shutil.copy(ROOT / filename, wrapper)
                result = subprocess.run(["bash", str(wrapper)], cwd=self.temp.name,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(os.access(ROOT / filename, os.X_OK))
        configure = "scripts/configure-chatgpt-tunnel.sh"
        self.assertTrue((ROOT / configure).exists())
        shutil.copy(ROOT / configure, self.root / configure)
        result = subprocess.run(["bash", str(self.root / configure), TUNNEL_ID],
                                cwd=self.temp.name, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(os.access(ROOT / configure, os.X_OK))


if __name__ == "__main__":
    unittest.main()
