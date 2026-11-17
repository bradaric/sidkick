# Development and checks

Use a prepared [source-checkout environment](setup.md). Documentation work should
not require a running game, tunnel, service restart or client-config change.

## Code map

| Path | Responsibility |
| --- | --- |
| `sidkick/server.py` | MCP metadata, fixed tool registrations, default read-only mode and stdio-only write opt-in |
| `civ7/queries.py` | Focused query selectors/validation and bundled-script dispatch |
| `civ7/player.py` | Snapshot boundary/error handling, export gate/publication and legacy `--mcp` entry |
| `civ7/connection.py` | Fixed bundled-script transport to loopback FireTuner; guarded started/loading paths |
| `civ7/actions.py` | Typed action validation, shared lock, bounded single-submission/readback workflows |
| `civ7/peace_negotiation.py` | Shared-lock multi-term negotiation, bounded search/frontier and recovery |
| `civ7/*.js` | Fixed native readers, action/target checks, submissions and readback helpers |
| `civ7/svg_preview.py`, `sidkick/map_preview.py` | Escaped SVG rendering/cache publication and static loopback viewer |
| `scripts/` | Optional tunnel lifecycle and live MCP smoke check |
| `tests/` | Python adapter/registration tests and Node native-interface fixtures |

The ignored pinned `civ7/FiretunerTerminal` checkout supplies protocol helpers.
Sidkick does **not** expose that project's arbitrary JavaScript tools or reuse
its CDP retry path for gameplay writes.

## Offline verification

From the root:

```sh
civ7/.venv/bin/python -B -m unittest discover -s tests -p 'test_*.py'
node --test --test-reporter=tap tests/test_*.cjs
git diff --check
```

These suites use mocks/synthetic fixtures; passing them is not live native
execution, a real tunnel integration test, or certification of every Age/DLC/mod.
They do not need gameplay writes. Prefer focused files while iterating, then
run the relevant regressions. Test counts belong in dated results, not permanent
promises on every reference page.

Inspect current registration without contacting the game or starting a listener:

```sh
civ7/.venv/bin/python -B - <<'PY'
from sidkick.server import create_server
for enabled in (False, True):
    tools = create_server(enable_writes=enabled)._tool_manager.list_tools()
    readers = sum(bool(tool.annotations.read_only_hint) for tool in tools)
    print(f'writes={enabled}: {len(tools)} total, {readers} readers, {len(tools)-readers} actions')
PY
```

The manager access above is a local development inspection, not a stable external
client API. Current expected totals are **31/160**, with **129 actions** in write
mode. Exact names should match the two [reference catalogs](reference/read-tools.md).

## Optional live read-only smoke check

Only when intentionally testing the loaded game:

```sh
civ7/.venv/bin/python -B scripts/check-live-mcp.py
```

It starts a temporary **read-only stdio child** and attempts to call every default
tool, with extra Civilopedia search/browse/article checks. **Known limitation:**
the script has not caught up with the map tools' required x/y selectors; it sends
empty arguments to ASCII/SVG tools and cannot currently complete a full 31-tool
pass. This was confirmed locally against registration/validation without game
access. Earlier historical all-tool passes predate those registrations.

The other checks require suitable live evidence (owned settlements/deployed units,
met major, loaded public definitions and a complete observed-consistent snapshot).
Transition execution readout may inspect pending profile eligibility; no gameplay
actions are sent. A correctly called SVG tool publishes only its preview cache.
This is not an all-variant gameplay test or a restart of an existing MCP session.
Do not load a save or manufacture a scenario merely to make a check pass.

## Documentation maintenance

- Keep the root README an introduction and route to [docs](README.md).
- Verify names/counts against registration and arguments against current schemas.
- Keep shared safety rules in [actions](actions.md); special state machines belong
  in [peace](peace-negotiation.md) or [transitions](transitions.md).
- Check local Markdown links/anchors after moving a page, including KB cross-links.
- Preserve evidence provenance: source/fixture, live read, positive native action,
  synthetic prerequisite and unknown result are different labels.
- Keep dated development logs in [history](history/README.md), not in setup guides.
  Campaign case studies stay in [civ7-kb](civ7-kb/README.md), explicitly historical.
- Leave edits unstaged/uncommitted unless the user explicitly asks to commit.

## Documentation audit — 2026-11-17

Offline regressions: **399 Python tests passed; 766 Node tests passed**.
Registration inspection matched all **31 readers and 129 actions** to the reference
catalogs. Live game/tunnel checks and Windows setup execution were not run.
The smoke-check selector gap and Python-minimum/package-layout discrepancies are
documented in the [backlog](civ7-action-backlog.md), not silently fixed as unrelated code.
