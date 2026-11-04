# Sidkick

Sidkick provides read-only, on-demand game data to AI strategy conversations.
Civilization VII is the first adapter.

## Current modes

- One-shot export writes the loaded Catherine save to its own JSON file.
- OpenCode launches a local MCP server over stdio and manages its process itself.
- The ChatGPT bridge runs a managed tunnel runtime, which launches its own stdio MCP server.
- A standalone HTTP MCP server is available for clients that connect to a URL.

The game adapter connects only to `127.0.0.1:4318`. It reads the local player's empire, decisions, settlements, research and government, religion, resources and trade, units, diplomacy, visible threats, turn context, Test of Time victory progress, and known world. Map queries discard hidden tiles, diplomacy and victory queries discard unmet players, and threat queries scan only tiles visible this turn. It does not poll between tool calls or change game state.

## OpenCode: no start/stop wrapper needed

With Sidkick configured as a **local stdio MCP server**, OpenCode launches the Python process when the MCP connection opens, reuses it for tool calls, and stops it when disconnected. This is per connection, not per question. After reboot, open OpenCode in the Sidkick repository and check `/mcps` for the connected Sidkick server. Civ VII must have a save loaded when you request game data.

The configured command is `civ7/.venv/bin/python -m sidkick.server --transport stdio`, run from the repository root. After Python server code or tool registrations change, disconnect/reconnect Sidkick through `/mcps` to load the new code. You do not need to restart Civ VII or the whole OpenCode service.

The ChatGPT bridge scripts below do **not** manage OpenCode's process. Do not start them merely to use Sidkick in OpenCode. The game connection is local, but tool results become part of the conversation sent to your selected AI provider.

## One-shot export

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

## Standalone local service

For a client that expects an HTTP URL, start the server yourself and leave the terminal open:

```bash
cd /path/to/sidkick
./civ7/.venv/bin/python -m sidkick.server
```

On Windows:

```powershell
.\civ7\.venv\Scripts\python.exe -m sidkick.server
```

The MCP endpoint is `http://127.0.0.1:8765/mcp`; press Ctrl+C to stop it. It binds only to loopback by default. Neither OpenCode's stdio connection nor the ChatGPT bridge needs this HTTP server. It queries Civ VII only when a client calls a tool. Use the focused empire, decisions, settlement, growth, research/government, religion, resources/trade, units, diplomacy, visible-threats, turn-context, victory-progress, or known-world tools for normal advice. The separate explored-map tool can return a much larger response.

`get_civ7_growth` returns growth progress, legal rural expansion options, separate improvement placement previews, and specialist placements (including empty, blocked, or full slots). Legal growth choices require population ready to place; improvement previews are not promises of legal expansion. Yield changes are per turn, positive maintenance changes are extra costs, and net changes subtract maintenance. Missing improvement previews return `null`, not zero benefit. Hidden tiles are excluded. Growth data is also included in snapshots and exports.

### Building/wonder placement versus growth

`get_civ7_building_placements` answers **where to build or purchase a building/wonder**, not where to place population. It requires one owned settlement's exact displayed name (case-insensitive). Optionally filter to an exact constructible type ID or displayed name:

```json
{"settlement": "Bàakʼ", "constructible": "BUILDING_BANK"}
```

Omit `constructible` to inspect all currently offered building/wonder choices in that settlement. The tool returns deduplicated, revealed legal placement tiles, production/purchase availability and costs, production turns, urban expansion flags, engine-calculated yield bonuses and losses, displaced constructibles, upkeep changes, and net yield changes per turn. Tile `validForProduction`/`validForPurchase` flags describe placement validity; check the corresponding building-level `availableNow` and `affordable` fields before treating it as an action available now. Unaffordable purchases can still have valid tiles. An explicitly filtered unavailable building returns query-provided failure reasons when present; a filter absent from the settlement's construction/purchase queries returns an error.

Yield totals include engine-reported effects on other settlements, not just the selected settlement. Positive `maintenanceChanges` are additional costs; `netYieldChanges` subtract them and account for removed upkeep when overbuilding. Missing placement previews are explicitly marked and return `null` yield data, not zero benefit. Bonus breakdowns retain negative changes and omit hidden source/target coordinates. Ambiguous settlement names fail rather than choosing an arbitrary city; ambiguous building names require a type ID.

The existing decisions tool remains a compact construction/purchase summary, and the growth tool remains separate. Targeted building placements are not added to the all-empire snapshot/export. All these tools are read-only: they never place, queue, or purchase anything. FireTuner itself is a request/response JavaScript interface capable of game-changing commands, but Sidkick exposes only fixed bundled query scripts. Selectors are JSON-encoded data, not executable JavaScript or an arbitrary-code tool.

### Religion and belief choices

`get_civ7_religion` reads the local player's founded religion (including its custom name), selected pantheons and beliefs with effect descriptions, holy city name, belief-class slot counts, and each owned settlement's majority, urban, and rural religions. If the player has not founded a religion, `religion` is `null`; a split or unconverted settlement can have no majority while still having urban/rural religions. For foreign religions, founder identities and custom names are resolved only when the founder has been met. The response does not scan foreign settlements or include hidden world totals.

Choice data distinguishes several checks:

- `claimable`: the belief has not been exclusively claimed, as reported by the game; this alone does not make it usable now.
- `operationAllowed`: the engine's read-only operation check, which can succeed even when the picker has no free slot for that belief class.
- `slotAvailable`: a free class slot under the same earned-belief rules as the game's belief picker.
- `availableNow`: an existing religion has a free class slot and both claimability and the operation check permit adding the belief. Pantheons instead require an unlocked pantheon choice and the `FOUND_PANTHEON` operation check.
- `availableForFounding`: a claimable belief selectable in the initial founding picker, gated by `canFoundReligion` and its class slots. This is not an independently executable add-belief action before founding.

Choices exclude already-selected beliefs/pantheons and retain engine failure reasons and additional descriptions for other options. Religion data is also included in snapshots and exports. The tool never founds a religion, chooses a belief, or converts a settlement.

## ChatGPT architecture

ChatGPT shows two Sidkick entries under Plugins because they are different layers:

- **Sidkick Engine** is the App connection. It registers the MCP tools and connects ChatGPT to the tunnel.
- **Sidkick** is the user-facing Plugin. It supplies the name, description, icon, and starting prompt, and depends on Sidkick Engine for live data.

The complete request path is:

```text
Chat prompt -> Sidkick Plugin -> Sidkick Engine -> authenticated tunnel
-> local tunnel-client -> Sidkick Python MCP server
-> Civ VII FireTuner at 127.0.0.1:4318
```

Results return through the same path. The game connection remains local, no inbound game port is exposed, and only data requested by a tool call is returned to the conversation. A Plugin can appear installed while the local tunnel is offline; live calls require Civ VII with a save loaded and the ChatGPT bridge running. ChatGPT does not launch this tunnel runtime for you.

## Private ChatGPT connection

Sidkick uses [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) in supervised stdio mode. Create or reuse a tunnel in Platform tunnel settings and a restricted runtime API key with Tunnels Read + Use. Do not use an admin key or paste credentials into chat or command arguments. Creating a tunnel/ChatGPT app connection is separate from running these scripts.

### Linux

Prerequisites:

- Bash and Python 3.10+.
- A working `civ7/.venv/bin/python` environment with Sidkick's dependencies. See [adapter setup](civ7/README.md); the Linux environment commands are `python3 -m venv civ7/.venv` and `./civ7/.venv/bin/python -m pip install -r civ7/requirements.txt` after obtaining the FiretunerTerminal dependency.
- The official **full** Linux `tunnel-client` release for your architecture, installed at `tools/tunnel-client/bin/tunnel-client` with its companion files. Download and verify it using the [official release instructions](https://github.com/openai/tunnel-client#validate-a-downloaded-release). The narrower `tunnel-client-runtime` binaries do not support the lifecycle commands these wrappers use. The scripts do not install or download anything.

First-time setup, from the repository root:

```bash
./scripts/configure-chatgpt-tunnel.sh tunnel_0123456789abcdef0123456789abcdef
```

This securely prompts for the runtime key without echoing it, saves it in ignored `.sidkick/tunnel-runtime-key.txt` with mode `0600`, saves the tunnel ID in `.sidkick/tunnel-id`, and connects the managed runtime. It reuses an existing owner-only key; add `--replace-key` to deliberately replace it. Use an interactive terminal for the hidden prompt. The `.sidkick/` directory and its generated profile/runtime directories are owner-only (`0700`). Configuration remains saved if connecting fails, so correct the prerequisite or connection problem and retry start.

Daily use, including after reboot:

```bash
./start-sidkick.sh
./sidkick-status.sh
./stop-sidkick.sh

# Reload the bridge's Python process after server/tool changes:
./stop-sidkick.sh && ./start-sidkick.sh
```

The wrappers work from any directory when invoked by their path. Start reports success only after checking the tunnel client's `process_running`, `healthy`, and `ready` flags; status exits nonzero when any is false. Bridge readiness does not establish that Civ VII has a save loaded or that ChatGPT has refreshed its tool list: verify those separately. Stop targets only the managed `sidkick` alias in this repository's isolated `.sidkick/linux-runtime` state, not OpenCode, other tunnel aliases, or arbitrary Python processes. The tunnel client owns supervision and logs; these scripts do not use `nohup`, PID-file killing, or a second HTTP server.

The runtime can survive closing the launch terminal, but these wrappers do **not** install a boot/login service. Run start again after reboot. Keep only one bridge runtime active per tunnel ID: do not run the Windows and Linux bridges simultaneously against the same tunnel. OpenCode may use its separate direct stdio connection without a tunnel.

For CLI troubleshooting, use the same repository-scoped state rather than the tunnel client's global aliases:

```bash
TUNNEL_CLIENT_STATE_DIR="$PWD/.sidkick/linux-runtime" \
  ./tools/tunnel-client/bin/tunnel-client runtimes status sidkick --json
```

Review CLI output locally before sharing; keep keys and private logs out of chat and Git. If a wrapper reports a client exit code, this native status output provides more detail without the wrapper echoing potentially sensitive client errors.

### Windows (existing wrappers)

Install the official full client under `tools\tunnel-client` and prepare the Python environment, then run:

```powershell
.\scripts\configure-chatgpt-tunnel.ps1 -TunnelId tunnel_0123456789abcdef0123456789abcdef
```

The script prompts securely for the runtime key, saves it in the ignored `.sidkick/` directory with access limited to the current Windows account, starts the managed runtime, and prints its health status. Future sessions use:

```powershell
.\scripts\start-chatgpt-bridge.ps1
.\scripts\stop-chatgpt-bridge.ps1
```

For double-click use, run `start-sidkick.bat` or `stop-sidkick.bat` from the repository root. Automatic startup is controlled by `enable-start-with-windows.bat` and `disable-start-with-windows.bat`; `start-with-windows-status.bat` reports the current setting. This uses the current user's Windows Startup folder and does not require administrator rights.

