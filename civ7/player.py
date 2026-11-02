import argparse
import asyncio
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from civ7.connection import run_script
from civ7.queries import (
    empire,
    explored_map,
    known_world,
    research_and_government,
    resources_and_trade,
    settlements,
    units,
)

ROOT = Path(__file__).resolve().parent


async def snapshot() -> dict[str, Any]:
    """Read a complete strategy snapshot without the large per-tile map."""
    core = await run_script("player.js")
    empire_data = await empire()
    settlement_data = await settlements()
    research_data = await research_and_government()
    commerce_data = await resources_and_trade()
    unit_data = await units()
    world_data = await known_world()
    return {
        **core,
        "empire": empire_data,
        "settlements": settlement_data["settlements"],
        "archivedGreatWorks": settlement_data["archivedGreatWorks"],
        "researchAndGovernment": research_data,
        "resourcesAndTrade": commerce_data,
        "units": unit_data["units"],
        "knownWorld": world_data,
    }


async def full_snapshot() -> dict[str, Any]:
    """Read every Sidkick domain for a portable JSON export."""
    strategy = await snapshot()
    map_data = await explored_map()
    return {
        **strategy,
        "exploredMap": map_data,
    }


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
        from sidkick.server import create_server
        server = create_server()
        server.run(transport="stdio")
    else:
        data = asyncio.run(full_snapshot())
        path = export_path(data)
        with NamedTemporaryFile(dir=ROOT, mode="w", encoding="utf-8", delete=False) as tmp:
            json.dump(data, tmp, indent=2, ensure_ascii=False)
        Path(tmp.name).replace(path)
        print(path)
