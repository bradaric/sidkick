"""Read local save metadata with one native asynchronous query, never save/load."""

import asyncio
from contextlib import suppress
from typing import Any
from uuid import uuid4

from civ7.connection import run_script


async def read_save_inventory() -> dict[str, Any]:
    request_id = uuid4().hex
    try:
        result = await run_script("save_load.js", {"operation": "list_start", "request_id": request_id})
        async with asyncio.timeout(6):
            while result.get("status") == "pending":
                await asyncio.sleep(0.1)
                result = await run_script("save_load.js", {"operation": "list_poll", "request_id": request_id})
        return result
    finally:
        # Close only this metadata query, never any UI query or native save/load.
        with suppress(Exception):
            await run_script("save_load.js", {"operation": "list_close", "request_id": request_id})
