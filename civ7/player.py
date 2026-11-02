import argparse
import asyncio
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from typing import Any

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "FiretunerTerminal"))
from civ7_terminal.connection import _wrap_js
from civ7_terminal.protocol import decode_header, encode_command


async def snapshot() -> dict[str, Any]:
    """Read the current local player's strategy snapshot."""
    marker = "SIDKICK_RESULT:"
    async with asyncio.timeout(12):
        reader, writer = await asyncio.open_connection("127.0.0.1", 4318)
        try:
            script = (ROOT / "player.js").read_text(encoding="utf-8")
            writer.write(encode_command(_wrap_js(script, marker)))
            await writer.drain()
            while True:
                length, _ = decode_header(await reader.readexactly(8))
                if length > 8_000_000:
                    raise ValueError("Oversized FireTuner response")
                frame = await reader.readexactly(length)
                if frame.startswith(marker.encode()):
                    body = frame[len(marker):].rstrip(b"\0").decode()
                    if not body.startswith("{"):
                        raise RuntimeError(body)
                    return json.loads(body)
        finally:
            writer.close()
            await writer.wait_closed()


def export_path(data: dict[str, Any]) -> Path:
    words = data["civilization"].casefold().split()
    if data["leader"] == "Catherine the Great" and data["age"] == "Exploration":
        if "maya" in words:
            return ROOT / "save-1-maya.json"
        if "chola" in words or "cholan" in words:
            return ROOT / "save-2-chola.json"
    raise SystemExit("Unrecognized leader, Age, or civilization. No export written.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mcp", action="store_true")
    args = parser.parse_args()
    if args.mcp:
        from mcp.server.fastmcp import FastMCP
        server = FastMCP("Sidkick Civ VII")
        server.tool()(snapshot)
        server.run(transport="stdio")
    else:
        data = asyncio.run(snapshot())
        path = export_path(data)
        with NamedTemporaryFile(dir=ROOT, mode="w", encoding="utf-8", delete=False) as tmp:
            json.dump(data, tmp, indent=2, ensure_ascii=False)
        Path(tmp.name).replace(path)
        print(path)
