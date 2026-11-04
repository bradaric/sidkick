# Civilization VII

From the Sidkick root, with the game running and your save loaded:

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

For your two Catherine Exploration saves, the exporter writes `civ7/save-1-maya.json` or `civ7/save-2-chola.json` according to the loaded civilization, so one save cannot overwrite the other. Upload the matching file to your strategy chat. The export includes empire totals, available decisions, detailed settlements, research and government, Triumphs and Dedications, resources and trade, your units, met-player diplomacy, visible threats, turn context, Test of Time victory progress, known relationships, and only map tiles already revealed to you.

Snapshots include `snapshotStatus`; inspect it before treating domains as a coherent game state. Successful domains survive individual failures, while failed fields are `null` with explicit errors. Observed turn/Age/local-player/identity changes are flagged; missing consistency evidence is unknown. The exporter refuses partial, inconsistent or unverified results before creating/replacing any file. The explored map is included inside the export's consistency boundary. These are observed-state checks, not an atomic read or a guarantee against changes within the same turn. Filename recognition remains restricted to the two Exploration saves above.

The adapter is read-only and connects only to FireTuner at `127.0.0.1:4318`. It does not reveal hidden tiles or unmet-player data; enemy units are queried only from tiles visible this turn. Its legacy stdio MCP entry point is the same command with `--mcp`.

The repository-level standalone service exposes focused on-demand tools over local HTTP:

```powershell
.\civ7\.venv\Scripts\python.exe -m sidkick.server
```

## Recreate the environment

```powershell
git clone https://github.com/ghost-ng/FiretunerTerminal.git civ7/FiretunerTerminal
git -C civ7/FiretunerTerminal checkout 35d08e12e0d875f335cd295fced316f05fa7f2a9
py -3.13 -m venv civ7/.venv
.\civ7\.venv\Scripts\python.exe -m pip install -r civ7/requirements.txt
```
