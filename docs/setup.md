# Setup and connections

Run commands from the Sidkick repository root unless noted otherwise.

## Python environment

Use **Python 3.11+**: although package metadata still declares 3.10, the adapter
uses `asyncio.timeout`, introduced in 3.11. The external FiretunerTerminal checkout
provides protocol helpers; it is ignored by Git and is not bundled by `pip install .`.

If that checkout is missing, obtain the pinned dependency (do not replace an
existing checkout or its changes):

```sh
git clone https://github.com/ghost-ng/FiretunerTerminal.git civ7/FiretunerTerminal
git -C civ7/FiretunerTerminal checkout 35d08e12e0d875f335cd295fced316f05fa7f2a9
```

Linux:

```sh
python3 -m venv civ7/.venv
civ7/.venv/bin/python -m pip install -r civ7/requirements.txt
```

Windows PowerShell:

```powershell
py -3.13 -m venv civ7/.venv
.\civ7\.venv\Scripts\python.exe -m pip install -r civ7/requirements.txt
```

The requirements include the terminal dependency's requirements and
`mcp[cli]>=2,<3`. Keep using the source checkout: current runtime assets and the
external protocol helper are resolved from that layout.

## Game connection

Enable FireTuner in the game's `AppOptions.txt` with `EnableTuner 1`, then restart
the game if you changed that setting. On Windows the file is under
`%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\`.
For other installations, locate the game's own options file rather than editing
an unrelated copy. See the dependency's [FireTuner instructions](../civ7/FiretunerTerminal/README.md#enable-firetuner-in-civ-7).

Sidkick's transport connects only to **127.0.0.1:4318**, on the machine running
the game. It has no CDP fallback or automatic write retry. Most gameplay tools
need a loaded save; ordinary writes require native GameStarted readiness.
Save browsing/loading and transition loading have dedicated guarded paths.
Do not expose the debug port publicly or on the LAN.

## OpenCode (recommended)

OpenCode starts a **local stdio** server and owns its connection lifecycle. It does
not need the HTTP server or ChatGPT start/stop wrappers.

Example **OpenCode V2** configuration (`opencode.jsonc`), using absolute paths so
the interpreter and working directory are unambiguous:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "sidkick": {
        "type": "local",
        "command": ["/absolute/path/to/sidkick/civ7/.venv/bin/python", "-m", "sidkick.server", "--transport", "stdio"],
        "cwd": "/absolute/path/to/sidkick"
      }
    }
  }
}
```

On Windows use the environment's `Scripts/python.exe` path. The repository's
`mcp.json` is a **plugin manifest with Windows paths**, not an OpenCode V2 config;
do not paste its `mcpServers` shape into `opencode.jsonc`.

Use `/mcps` to check, connect or disconnect Sidkick. After changing Python server
code or tool registrations, disconnect/reconnect Sidkick to load the new process.
Restarting Civ VII or the whole OpenCode service is unnecessary for server-code
updates. After reboot, open OpenCode and verify the connection again.

To deliberately enable actions, add `--enable-writes` to the stdio command only
after reading the [action guide](actions.md). Use one write-enabled server for
the game; serialization is not shared across processes.

Source: [OpenCode V2 MCP documentation](https://opencode.ai/v2/docs/mcp-servers).

## Standalone HTTP

For clients requiring a URL, start a read-only server and leave its terminal open:

```sh
civ7/.venv/bin/python -m sidkick.server
```

Windows: `.\civ7\.venv\Scripts\python.exe -m sidkick.server`.
The default transport is `streamable-http`, bound to
**http://127.0.0.1:8765/mcp**. Ctrl+C stops it. `--port` can select a different
port; keep the host on loopback. `--enable-writes` is rejected over HTTP.

The [map viewer](maps.md#svg-viewer) also defaults to port 8765. Do not run both
listeners on that port; use a different MCP HTTP port if both are needed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing `civ7_terminal` import | Pinned checkout exists at `civ7/FiretunerTerminal`; dependencies installed in the interpreter the client actually uses |
| Connection refused on 4318 | Game running on the same host, FireTuner enabled, save loaded; do not start a public proxy |
| Old/missing tools | Reconnect the Sidkick MCP connection; discover its current catalog |
| Writes unavailable | Read-only is the default; only explicit stdio write mode registers them |
| “Finish loading and click Begin first” | Inspect the appropriate [loading workflow](transitions.md), not another gameplay request |
| Partial/unverified snapshot | Read its errors and boundary markers; do not treat it as an empty empire |
| Address already in use | Check your HTTP/viewer port choices; do not kill an unrelated process |

For offline checks and the optional game-connected smoke test, see
[development](development.md). No setup, service or client configuration is
changed merely by reading these instructions.
