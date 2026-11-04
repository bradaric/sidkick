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
    age_transition,
    available_decisions,
    city_states,
    diplomacy,
    empire,
    explored_map,
    growth,
    known_world,
    religion,
    research_and_government,
    resources_and_trade,
    settlements,
    turn_context,
    units,
    visible_threats,
    victory_progress,
)

ROOT = Path(__file__).resolve().parent


async def snapshot() -> dict[str, Any]:
    """Read strategy domains with explicit partial/observed-consistency status."""
    return await _snapshot(include_map=False)


async def full_snapshot() -> dict[str, Any]:
    """Include the explored map inside the same snapshot consistency boundary."""
    return await _snapshot(include_map=True)


async def _snapshot(*, include_map: bool) -> dict[str, Any]:
    readers = [
        ("player", lambda: run_script("player.js")),
        ("empire", empire), ("settlements", settlements), ("growth", growth),
        ("researchAndGovernment", research_and_government), ("religion", religion),
        ("resourcesAndTrade", resources_and_trade), ("units", units),
        ("knownWorld", known_world), ("victoryProgress", victory_progress),
        ("availableDecisions", available_decisions), ("diplomacy", diplomacy),
        ("cityStates", city_states), ("visibleThreats", visible_threats),
        ("turnContext", turn_context), ("ageTransition", age_transition),
    ]
    if include_map:
        readers.append(("exploredMap", explored_map))
    # Preserve the existing flattened core/settlement/unit fields, never stale fallbacks.
    flattened = {
        "player": ("civilization", "leader", "turn", "age", "technology", "civic", "triumphs", "dedications"),
        "settlements": ("settlements", "archivedGreatWorks"),
        "units": ("units",),
    }
    errors = {}
    turns = {}
    data = {}

    def record_error(domain: str, error: Exception) -> None:
        errors[domain] = {"type": type(error).__name__, "message": str(error)[:500]}

    async def state_at(boundary: str) -> dict[str, Any] | None:
        try:
            state = await run_script("snapshot_state.js")
            if (
                not isinstance(state, dict) or type(state.get("turn")) is not int or state["turn"] < 0
                or type(state.get("playerId")) is not int or state["playerId"] < 0
                or any(type(state.get(key)) not in (int, str) or state[key] == ""
                       for key in ("age", "civilization", "leader"))
            ):
                raise ValueError("Snapshot boundary identity/turn is unavailable")
            return {key: state[key] for key in ("turn", "age", "playerId", "civilization", "leader")}
        except Exception as error:
            record_error(boundary, error)
            return None

    start = await state_at("start")
    for domain, read in readers:
        fields = flattened.get(domain)
        output = {key: None for key in fields} if fields else {domain: None}
        turns[domain] = None
        try:
            result = await read()
            if not isinstance(result, dict):
                raise TypeError("Snapshot domain did not return an object")
            if domain in ("settlements", "units") and any(not isinstance(result.get(key), list) for key in fields):
                raise TypeError("Snapshot domain lists are unavailable")
            output = {key: result[key] for key in fields} if fields else {domain: result}
            turn = result.get("turn")
            turns[domain] = turn if type(turn) is int and turn >= 0 else None
        except Exception as error:
            # Cancellation/process exits are deliberately not caught as partial success.
            record_error(domain, error)
        data.update(output)
    end = await state_at("end")

    observed_turns = {turn for turn in turns.values() if turn is not None}
    observed_turns.update(state["turn"] for state in (start, end) if state is not None)
    if len(observed_turns) > 1 or (start is not None and end is not None and start != end):
        consistent = False
    elif start is None or end is None or any(turn is None for domain, turn in turns.items() if domain not in errors):
        consistent = None
    else:
        consistent = True
    complete = not errors
    if consistent is False:
        status = "inconsistent"
    elif not complete:
        status = "partial"
    elif consistent is None:
        status = "unverified"
    else:
        status = "complete"
    return {
        "snapshotStatus": {
            "status": status, "complete": complete, "consistent": consistent,
            "start": start, "end": end, "domainTurns": turns, "errors": errors,
            "warning": None if status == "complete" else "Do not treat this result as a complete coherent snapshot; inspect domain errors and turn/state evidence",
            "consistencyScope": "Observed boundary turn/Age/local-player/civilization/leader and reported domain turns only. Not atomic; same-turn changes or a save switch with identical markers are not ruled out",
        },
        **data,
    }


def export_path(data: dict[str, Any]) -> Path:
    status = data.get("snapshotStatus")
    if (
        not isinstance(status, dict) or status.get("status") != "complete"
        or status.get("complete") is not True or status.get("consistent") is not True
    ):
        raise SystemExit("Snapshot is incomplete, inconsistent, or unverified. No export written.")
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
