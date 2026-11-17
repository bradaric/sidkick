# Civilization VII adapter

The adapter connects to the running game at **127.0.0.1:4318** using fixed bundled
FireTuner scripts. Read-only is the default; typed gameplay actions are a separate
stdio-only opt-in. Hidden-world filtering and public-scoreboard exceptions are
described in the [read reference](../docs/reference/read-tools.md).

- [Setup and pinned dependency](../docs/setup.md)
- [Snapshots and safe JSON export](../docs/snapshots.md)
- [Action safety/workflows](../docs/actions.md)
- [Development and tests](../docs/development.md)

From the repository root, export **any complete loaded save** to a new private file:

```sh
civ7/.venv/bin/python civ7/player.py --output modern-t57.json
```

Windows: `.\civ7\.venv\Scripts\python.exe .\civ7\player.py --output modern-t57.json`.
Explicit output never overwrites. The legacy no-argument command is restricted
to the two Catherine Exploration filenames and can replace the matching export.
`--mcp` remains a read-only stdio entry point; use `python -m sidkick.server` for
the repository server's transport/write options. See the guides above rather
than duplicating setup or full tool contracts here.
