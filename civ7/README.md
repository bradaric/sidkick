# Civilization VII

From the Sidkick root, with the game running and your save loaded:

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

For your two Catherine Exploration saves, the exporter writes `civ7/save-1-maya.json` or `civ7/save-2-chola.json` according to the loaded civilization. Upload the matching file to your strategy chat. The adapter reads one local-player snapshot—including Test of Time Triumph progress and Dedication choices—through FireTuner on 127.0.0.1:4318. Its legacy stdio MCP entry point is the same command with `--mcp`.

The repository-level standalone service exposes the same on-demand snapshot over local HTTP:

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
