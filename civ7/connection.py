"""Local, read-only FireTuner connection helpers for Civ VII."""

import asyncio
from contextlib import suppress
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "FiretunerTerminal"))

from civ7_terminal.connection import _wrap_js
from civ7_terminal.protocol import decode_header, encode_command


async def run_script(script_name: str) -> dict[str, Any]:
    """Execute one bundled read-only query and return its JSON object."""
    script_path = (ROOT / script_name).resolve()
    if script_path.parent != ROOT or script_path.suffix != ".js":
        raise ValueError("Civ VII queries must be bundled JavaScript files")

    marker = "SIDKICK_RESULT:"
    async with asyncio.timeout(12):
        reader, writer = await asyncio.open_connection("127.0.0.1", 4318)
        try:
            script = script_path.read_text(encoding="utf-8")
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
                    result = json.loads(body)
                    if not isinstance(result, dict):
                        raise TypeError("Civ VII query did not return an object")
                    return result
        finally:
            writer.close()
            with suppress(ConnectionError, OSError):
                await writer.wait_closed()
