# Snapshots and exports

Prefer [focused reads](reference/read-tools.md) for normal advice. A broad
`get_civ7_player_snapshot` combines strategy domains but excludes large/targeted
queries; the full JSON export additionally includes the explored map.

## Read `snapshotStatus` first

| Status | Meaning |
| --- | --- |
| `complete` | Reads/checks succeeded and observed consistency evidence agrees |
| `partial` | At least one domain/boundary check failed; failed fields are null, with per-domain errors |
| `inconsistent` | Observed turn/Age/player/identity changed or domain turns disagree; takes precedence over partial |
| `unverified` | Reads succeeded but required consistency evidence is missing; `consistent` is null |

`complete` describes collection success, not certainty of every optional field.
Inspect `errors`, `start`, `end` and `domainTurns`. Successful domains survive
other failures; there is no stale-core fallback, automatic retry or UI action.

Collection is **sequential, not atomic**. Same-turn edits and switching saves
with identical boundary markers cannot always be detected. Compare turns on
separate focused reads too. Missing evidence is not an empty inventory or zero.

## Export any loaded save

Choose a **new file in an existing private directory**:

```sh
civ7/.venv/bin/python civ7/player.py --output modern-t57.json
```

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py --output modern-t57.json
```

This supports any loaded leader/civilization/Age. Relative paths use the current
working directory; absolute paths are accepted. `--output` and `--mcp` are
mutually exclusive.

Before creating even a temporary export, the exporter requires
`status: complete`, `complete: true` and `consistent: true`. The explored map is
inside that same consistency boundary. A JSON export is data, **not a loadable
game save**; see [save/load](transitions.md#ordinary-save-and-load) for that.

Explicit exports never overwrite an existing file, symlink or racing writer.
Publication uses a temporary file and a no-replace hard link in the destination
directory. Unsupported filesystems fail safely rather than overwrite; temporary
files are cleaned up on errors. There is no force flag or automatic parent creation.

## Legacy no-argument export

`civ7/player.py` without arguments recognizes only the two Catherine Exploration
saves and **replaces** their matching `civ7/save-1-maya.json` or
`civ7/save-2-chola.json`. Other saves require `--output FILE`. Prefer explicit
new filenames when preserving evidence. Detailed local/map data should not be
committed or shared unintentionally.
