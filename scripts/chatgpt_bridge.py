"""Linux lifecycle commands for Sidkick's managed ChatGPT tunnel, not OpenCode."""

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import warnings


ROOT = Path(__file__).resolve().parents[1]


def validate_tunnel_id(value: str) -> str:
    if not re.fullmatch(r"tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}", value):
        raise ValueError("Invalid tunnel ID; use the complete ID from Platform tunnel settings.")
    return value


def private_directory(path: Path) -> None:
    if path.is_symlink():
        raise ValueError(f"Refusing symlink directory: {path}")
    path.mkdir(mode=0o700, exist_ok=True)
    path.chmod(0o700)


def check_key(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        raise ValueError("The runtime key must be a regular file owned by the current user, not a symlink.")
    if info.st_mode & 0o077 or info.st_size == 0:
        raise ValueError("The runtime key must be nonempty and owner-only (chmod 600).")


def write_private(path: Path, value: str) -> None:
    if path.is_symlink():
        raise ValueError(f"Refusing symlink file: {path}")
    with tempfile.NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(value)
            output.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def client_path() -> Path:
    client = ROOT / "tools/tunnel-client/bin/tunnel-client"
    if not client.is_file() or not os.access(client, os.X_OK):
        raise ValueError("Install the official full Linux tunnel-client at tools/tunnel-client/bin/tunnel-client; see README.md.")
    return client


def run_client(*args: str) -> str:
    directory = (ROOT / ".sidkick").lstat()
    if (not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.getuid()
            or directory.st_mode & 0o077):
        raise ValueError("The .sidkick directory must be owned by the current user, not a symlink, and mode 700.")
    environment = os.environ.copy()
    # Keep this repository's alias separate from other clients and Windows state.
    environment["TUNNEL_CLIENT_STATE_DIR"] = str(ROOT / ".sidkick/linux-runtime")
    result = subprocess.run(
        [str(client_path()), "runtimes", *args], cwd=ROOT, env=environment,
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode:
        # Do not echo subprocess output: an upstream error could contain credentials.
        raise ValueError(f"tunnel-client runtimes {args[0]} failed with exit code {result.returncode}.")
    return result.stdout


def status() -> int:
    data = json.loads(run_client("status", "sidkick", "--json"))
    fields = ("process_running", "healthy", "ready")
    if not isinstance(data, dict) or any(not isinstance(data.get(key), bool) for key in fields):
        raise ValueError("Unexpected tunnel-client status; expected process_running, healthy and ready booleans.")
    if all(data[key] for key in fields):
        print("Sidkick ChatGPT bridge is running and ready.")
        return 0
    print("Sidkick ChatGPT bridge is not ready: " + ", ".join(f"{key}={data[key]}" for key in fields))
    return 1


def connect(tunnel_id: str) -> int:
    python = ROOT / "civ7/.venv/bin/python"
    if not python.is_file() or not os.access(python, os.X_OK):
        raise ValueError("The Sidkick Python environment is missing under civ7/.venv; see README.md.")
    key = ROOT / ".sidkick/tunnel-runtime-key.txt"
    check_key(key)
    # The absolute entry point also works if the supervised child changes directory.
    command = shlex.join([str(python), str(ROOT / "civ7/player.py"), "--mcp"])
    run_client(
        "connect", "--alias", "sidkick", "--profile", "sidkick",
        "--profile-dir", str(ROOT / ".sidkick/profiles"),
        "--tunnel-id", tunnel_id, "--runtime-api-key", f"file:{key}",
        "--mcp-command", command,
    )
    return status()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    configure = commands.add_parser("configure", help="Save local settings and connect the ChatGPT bridge")
    configure.add_argument("tunnel_id")
    configure.add_argument("--replace-key", action="store_true", help="Prompt for and replace the saved runtime key")
    for action in ("start", "stop", "status"):
        commands.add_parser(action)
    args = parser.parse_args(argv)

    try:
        if args.action == "configure":
            tunnel_id = validate_tunnel_id(args.tunnel_id)
            client_path()
            python = ROOT / "civ7/.venv/bin/python"
            if not python.is_file() or not os.access(python, os.X_OK):
                raise ValueError("The Sidkick Python environment is missing under civ7/.venv; see README.md.")
            runtime = ROOT / ".sidkick"
            private_directory(runtime)
            private_directory(runtime / "profiles")
            private_directory(runtime / "linux-runtime")
            key = runtime / "tunnel-runtime-key.txt"
            if key.exists() or key.is_symlink():
                check_key(key)
            if args.replace_key or not key.exists():
                with warnings.catch_warnings():
                    warnings.simplefilter("error", getpass.GetPassWarning)
                    secret = getpass.getpass("Paste the restricted tunnel runtime API key (hidden): ")
                if not secret.strip():
                    raise ValueError("The runtime API key must not be empty.")
                write_private(key, secret)
            write_private(runtime / "tunnel-id", tunnel_id + "\n")
            return connect(tunnel_id)
        if args.action == "start":
            tunnel_file = ROOT / ".sidkick/tunnel-id"
            if not tunnel_file.is_file():
                raise ValueError("Run scripts/configure-chatgpt-tunnel.sh TUNNEL_ID first.")
            return connect(validate_tunnel_id(tunnel_file.read_text(encoding="utf-8").strip()))
        if args.action == "stop":
            run_client("stop", "sidkick")
            print("Sidkick ChatGPT bridge is stopped. OpenCode's separate process is unaffected.")
            return 0
        return status()
    except (OSError, ValueError, subprocess.TimeoutExpired, getpass.GetPassWarning, EOFError) as error:
        print(f"Sidkick bridge: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
