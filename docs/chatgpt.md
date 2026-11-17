# Private ChatGPT bridge

This is optional. **OpenCode uses direct stdio and does not need these wrappers.**
The supplied bridge commands launch read-only Sidkick; they do not enable actions.

## Architecture

```text
ChatGPT Plugin -> Sidkick Engine App connection -> authenticated tunnel
-> local tunnel-client -> Sidkick stdio MCP server -> FireTuner 127.0.0.1:4318
```

The Plugin supplies branding and a starting prompt; the Engine App connection
provides tools through the tunnel. Installed branding does not prove the local
runtime is connected. ChatGPT does not start that runtime for you. Game data
returned by tools enters the conversation; no inbound game port is needed.

## Prerequisites

- A working [Python/game setup](setup.md).
- An authorized tunnel and restricted runtime key with **Tunnels Read + Use**.
  Do not use an admin key or put secrets in chat, Git or command arguments.
- The official **full** `tunnel-client` release for your OS/architecture, including
  companion files. Runtime-only binaries lack the lifecycle commands used here.
  Follow the [official release verification instructions](https://github.com/openai/tunnel-client#validate-a-downloaded-release).

Tunnel/App creation is separate from these scripts. The wrappers do not download
the client, create cloud resources, or install boot/login services.

## Linux

Install the full client at `tools/tunnel-client/bin/tunnel-client`. From the root:

```sh
./scripts/configure-chatgpt-tunnel.sh tunnel_0123456789abcdef0123456789abcdef
```

It prompts for the key without echo, stores it in ignored
`.sidkick/tunnel-runtime-key.txt` (0600), saves `.sidkick/tunnel-id`, and connects
the managed runtime. `.sidkick/`, profile and runtime directories are owner-only
(0700). An existing owner-only key is reused; `--replace-key` deliberately prompts
for replacement. Use an interactive terminal. Configuration remains saved if
connection fails.

```sh
./start-sidkick.sh
./sidkick-status.sh
./stop-sidkick.sh

# Reload this bridge after server/tool changes:
./stop-sidkick.sh && ./start-sidkick.sh
```

Invoked by their path, wrappers work from other directories. Start/status require
`process_running`, `healthy` and `ready`; false flags cause a nonzero exit.
Stop targets the `sidkick` alias in this repository's `.sidkick/linux-runtime`
state—not OpenCode, other aliases or arbitrary Python processes.

For native diagnostics, from the root:

```sh
TUNNEL_CLIENT_STATE_DIR="$PWD/.sidkick/linux-runtime" \
  ./tools/tunnel-client/bin/tunnel-client runtimes status sidkick --json
```

Review output privately before sharing. Wrappers suppress potentially sensitive
upstream error output. The Linux bridge launches `civ7/player.py --mcp`, which
delegates to the same default read-only server.

## Windows

Install the full client at `tools\tunnel-client\bin\tunnel-client.exe`, then:

```powershell
.\scripts\configure-chatgpt-tunnel.ps1 -TunnelId tunnel_0123456789abcdef0123456789abcdef
.\scripts\start-chatgpt-bridge.ps1
.\scripts\stop-chatgpt-bridge.ps1
```

Configuration securely prompts for the key, stores it under ignored `.sidkick/`,
restricts the key ACL to the current Windows account, and connects the runtime.
Use `-ReplaceKey` for intentional replacement. Root `.bat` launchers wrap these
commands; startup scripts are separate opt-in host changes, not required setup.
Unlike Linux's isolated state directory, these PowerShell scripts use the tunnel
client's default runtime state with the `sidkick` alias. Avoid alias collisions.

## Verification limits

A ready tunnel is not proof that a game save is loaded or ChatGPT has refreshed
its tools. Verify an actual read-only tool call separately. Run only one bridge
per tunnel ID; do not connect Linux and Windows simultaneously to that tunnel.

Terminal-close survival is intended through client supervision, not a second
HTTP server or PID-killing wrapper. After reboot, start it again unless you have
separately arranged a startup service.

**Real Linux full-client integration remains unverified.** Local wrapper tests
use a fake client. The [deferred checklist](todo.md) tracks actual start/status/stop,
ChatGPT calls, terminal-close and reboot behavior. Do not read fixture success as
an end-to-end tunnel certification.
