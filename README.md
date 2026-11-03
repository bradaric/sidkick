# Sidkick

Sidkick provides read-only, on-demand game data to AI strategy conversations.
Civilization VII is the first adapter.

## Current modes

- One-shot export writes the loaded Catherine save to its own JSON file.
- Local and tunneled MCP serve focused Civ VII tools on demand.

The game adapter connects only to `127.0.0.1:4318`. It reads the local player's empire, settlements, research and government, resources and trade, units, Test of Time victory progress, and known world. Map queries discard hidden tiles, and diplomacy and victory queries discard unmet players. It does not poll between tool calls or change game state.

## One-shot export

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

## Standalone local service

```powershell
.\civ7\.venv\Scripts\python.exe -m sidkick.server
```

The MCP endpoint is `http://127.0.0.1:8765/mcp`. It queries Civ VII only when a client calls a tool. Use the focused empire, settlement, research/government, resources/trade, units, victory-progress, or known-world tools for normal advice. The separate explored-map tool can return a much larger response.

## Private ChatGPT connection

Sidkick uses OpenAI Secure MCP Tunnel in supervised stdio mode. Create a tunnel in Platform tunnel settings and a restricted runtime API key with Tunnels Read + Use. Then run:

```powershell
.\scripts\configure-chatgpt-tunnel.ps1 -TunnelId tunnel_0123456789abcdef0123456789abcdef
```

The script prompts securely for the runtime key, saves it in the ignored `.sidkick/` directory with access limited to the current Windows account, starts the managed runtime, and prints its health status. Future sessions use:

```powershell
.\scripts\start-chatgpt-bridge.ps1
.\scripts\stop-chatgpt-bridge.ps1
```

For double-click use, run `start-sidkick.bat` or `stop-sidkick.bat` from the repository root. Automatic startup is controlled by `enable-start-with-windows.bat` and `disable-start-with-windows.bat`; `start-with-windows-status.bat` reports the current setting. This uses the current user's Windows Startup folder and does not require administrator rights.

