# Sidkick

Live Civilization VII data for AI strategy conversations, with **read-only defaults**
and optional, explicitly authorized single-player gameplay actions.

Sidkick connects to the running game's local FireTuner interface. It reads your
empire, decisions, settlements, research, diplomacy, units and victory progress
on demand—not through a background game poller.

## Get started

1. [Set up Python and FireTuner](docs/setup.md).
2. Load a Civ VII save and finish the ordinary loading-screen **Begin**.
3. [Connect OpenCode over local stdio](docs/setup.md#opencode-recommended).
   OpenCode manages that process; no start/stop wrapper or tunnel is needed.
4. Ask: **“Read my current position, summarize this turn’s decisions, and check
   every victory deadline.”**

Other ways to use Sidkick:

| Mode | Guide |
| --- | --- |
| Export a JSON snapshot for a strategy chat | [Snapshots and exports](docs/snapshots.md) |
| Connect a client to a loopback HTTP URL | [Standalone HTTP](docs/setup.md#standalone-http) |
| Connect ChatGPT through a managed private tunnel | [ChatGPT bridge](docs/chatgpt.md) |
| View a local colored map | [Map previews](docs/maps.md) |

## Read or play—deliberately

The default server registers **31 game-read-only tools**. Starting it with
`--transport stdio --enable-writes` registers **160 tools total: 31 readers and
129 opt-in actions**, including gameplay, save/load and narrow UI workflows.
HTTP refuses write mode; the supplied ChatGPT bridge commands remain read-only.

Enabling actions is not permission to use them. Follow exact user instructions
or a bounded, explicitly delegated single-player sandbox scope. Actions can spend
resources, move or destroy units, transfer settlements, discard unsaved progress,
or advance turns/Ages. **Never automatically retry an unknown or cancelled action.**
See the [action guide](docs/actions.md) before enabling writes.

## Evidence and privacy

- Hidden tiles and unmet diplomatic identities are withheld. Visible-threat reads
  inspect tiles visible this turn; maps distinguish explored fog from current sight.
- The public victory scoreboard includes anonymous unmet-major totals/countdowns.
  Its Military ledger can name local/met settlements even under fog; this is not
  access to their private yields, queues or locations.
- Read `snapshotStatus` before treating a snapshot as coherent. Reads are sequential,
  not atomic; unknown data is not zero or proof of absence.
- Tool results enter your selected AI provider's conversation. Exports contain
  detailed game data. Keep FireTuner and game-control endpoints private.

## Documentation

Start at the **[documentation index](docs/README.md)** for setup, workflows,
tool references, limitations and development checks.

- [Read tools](docs/reference/read-tools.md) · [Action catalog](docs/reference/action-tools.md)
- [Coverage and verification limits](docs/civ7-coverage-audit.md) · [Remaining work](docs/civ7-action-backlog.md)
- [Campaign coaching knowledge base](docs/civ7-kb/README.md)—historical lessons, not live state
- [Development and tests](docs/development.md) · [Historical records](docs/history/README.md)
