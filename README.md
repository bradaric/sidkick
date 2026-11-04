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

The MCP endpoint is `http://127.0.0.1:8765/mcp`; press Ctrl+C to stop it. It binds only to loopback by default. Neither OpenCode's stdio connection nor the ChatGPT bridge needs this HTTP server. It queries Civ VII only when a client calls a tool. Use the focused empire, decisions, settlement, growth, research/government, religion, resources/trade, units, major-player diplomacy, city-state/independent diplomacy, visible-threats, turn-context, victory-progress, or known-world tools for normal advice. The separate explored-map tool can return a much larger response.

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

### Leader attribute trees

`get_civ7_research_and_government` includes attribute points and next-point progress, plus each applicable branch's purchased perks, effect descriptions, unlocks, prerequisite links and `prerequisiteMode` (for example, `OR` does not require every incoming node). Inapplicable nodes are excluded; visible legend-locked nodes retain their lock reason. Wildcard points remain a shared balance, not a separate spendable balance for each branch.

`basePointCost` and `funding` describe the definition's base cost and how many wildcard points would cover a branch-point shortfall. They are not an actual price quote for repeat purchases. `availableNow` uses the engine's read-only purchase check and node/legend state; sufficient funding alone does not unlock a perk. This tool never spends points.

### Yield breakdowns and bounded policy estimates

`get_civ7_settlements` includes `yieldBreakdown` for each yield: the engine's income and signed deductions, building/improvement/resource/trade and other source summaries, maintenance, and named income modifiers with an explicit `percent` unit. `value` is the engine-reported source total; `baseValue` and `modifierValue` are native calculation components, not extra yields to add to it. Sources are not guaranteed to explain all income: `otherBaseIncome` is the residual between reported base income and the returned source totals, not an attribution to a specific effect. Missing sources remain `null`. Use `netYields` for actual settlement totals; neither source values nor modifiers should be summed indiscriminately.

Cards in `get_civ7_research_and_government` include an `impact` record. The first supported estimates cover **only the base science component** of Pet Kot (distinct vegetated rural improvement tiles in cities, not towns), Milpa I (science-tagged buildings on vegetation, including towns), and Tequitl (the native current trade-route count, not projected route choices). Counts include only revealed, owned, complete, undamaged qualifying improvements/buildings and retain per-settlement location evidence. Tequitl returns count evidence without querying foreign settlements. The matching loaded modifier definitions and requirements are checked; unrecognized rules or missing amounts return an unknown estimate.

`status: "estimated"` and `estimatedBaseYields` describe a contribution **if the card is slotted**, not a simulated swap or its actual current empire-wide benefit. They exclude multipliers, cross-yield conversions (such as Catherine's culture-to-science ability), range benefits, future routes and any other effects. `estimatedNetYieldChange` remains `null`, including for active cards. Every unsupported card explicitly returns `status: "unknown"`, null counts and null yields—not zero benefit. These additions also appear in snapshots/exports; no policies are changed and no UI selection or game state is modified.

### City-state and independent diplomacy

`get_civ7_city_states` returns met city-states and met/discovered independent powers, relationships, suzerains, selected bonus effects, eligible bonus choices, local influence, and diplomatic action eligibility/costs, including incorporation. Hidden players and target coordinates are excluded; an unmet suzerain's identity is `null`. The existing `get_civ7_diplomacy` tool remains focused on met major players.

For action summaries, `availableNow` means the game offers the action for this power. If `requiresSecondaryTarget` is true (for example, choosing a unit to levy or a civilization to raid), the final target selection still needs its own eligibility check. `selectedTargetInfluenceCost` is the power-level UI quote, which can be a placeholder; `influenceCost` is `null` for secondary-target actions rather than implying a complete or zero cost. Other missing cost data also returns `null`.

Major-player diplomacy uses the same selected-target cost semantics, retaining its existing `available` field name. It reads the current engine's `targetList1` and that target's `costYieldD`, combines project and selected-target failure reasons, and never treats another player's target as an available choice for the queried leader. `targetChoices` is zero or one for that leader only. `secondaryTargetChoices` is `null` when a secondary selection is required (otherwise zero), rather than disclosing counts from unfiltered target lists. Zero-cost actions remain zero; missing costs remain `null`.

`bonusChoices[].eligible` follows the game's bonus picker; `availableNow` additionally requires a pending choice for this city-state, local suzerainty, and the engine's selection check. It does not imply an existing bonus can be replaced. `ongoingActions` includes only projects initiated by you against that power, with direct progress, required progress, turns remaining, and befriending support cost/eligibility. Other players' ongoing projects are omitted. City-state data and attribute trees are included in snapshots and exports. These tools never spend influence, select bonuses, befriend, levy, or incorporate anything.

### Town focuses, resource assignments and trade comparisons

`get_civ7_available_decisions` includes `townFocus` for towns: Growing Town plus the engine's currently offered project choices, current-selection flags, read-only eligibility and failure reasons, descriptions and population requirements. Project-specific checks use the project's hash, not its database index. Connected-settlement evidence is restricted to owned settlements. `reportedFoodPerConnectedCity` is a current engine value, **not** a projection for another focus or a guarantee that food is currently exported. Focus `netYieldChange` is `null`; Sidkick does not send `CONSIDER_TOWN_PROJECT` or change growth modes.

`get_civ7_resources_and_trade` adds `assignmentChoices` for each owned resource, with current assignment, per-settlement `ASSIGN_RESOURCE` eligibility and failure reasons. Map and off-map instances with the same numeric ID remain distinct. Eligibility checks never assign or unassign resources. Marginal yields remain `null`: the UI's stateful `CONSIDER_ASSIGN_RESOURCE` preview request is not used.

Trade comparisons retain blocked candidates with native status reasons and the current total route count. Only owned or revealed settlements belonging to met players are returned; origin names follow the same restriction. `status: "available"` is a route-level quote, not permission for a particular Merchant to establish it. `merchantOperationAllowed` and marginal `netYieldChange` remain `null`. Engine import/export payloads are not treated as marginal empire-wide gains, and raw paths are omitted.

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
