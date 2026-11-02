# Sidkick

Sidkick provides read-only, on-demand game data to AI strategy conversations.
Civilization VII is the first adapter.

## Current modes

- One-shot export writes the loaded Catherine save to its own JSON file.
- Local MCP serves the same snapshot tool to Codex over stdio.
- Standalone MCP serves the tool over local HTTP for a future ChatGPT Secure MCP Tunnel connection.

The game adapter connects only to `127.0.0.1:4318`. It reads the local player's civilization, leader, turn, Age, settlements, yields, research, and production queues. It does not poll between tool calls.

## One-shot export

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

## Standalone local service

```powershell
.\civ7\.venv\Scripts\python.exe -m sidkick.server
```

The MCP endpoint is `http://127.0.0.1:8765/mcp`. It queries Civ VII only when a client calls `get_civ7_player_snapshot`.

