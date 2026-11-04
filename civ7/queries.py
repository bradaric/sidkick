"""Focused read-only Civ VII strategy queries."""

from typing import Any

from civ7.connection import run_script


async def empire() -> dict[str, Any]:
    return await run_script("empire.js")


async def available_decisions() -> dict[str, Any]:
    return await run_script("decisions.js")


async def settlements() -> dict[str, Any]:
    return await run_script("settlements.js")


async def growth() -> dict[str, Any]:
    return await run_script("growth.js")


async def building_placements(
    settlement: str, constructible: str | None = None,
) -> dict[str, Any]:
    """Read placements for one owned settlement, optionally one building or wonder."""
    settlement = settlement.strip()
    if not settlement:
        raise ValueError("A settlement name is required")
    if constructible is not None:
        constructible = constructible.strip()
        if not constructible:
            raise ValueError("The constructible filter must not be blank")
    return await run_script("building_placements.js", {
        "settlement": settlement, "constructible": constructible,
    })


async def research_and_government() -> dict[str, Any]:
    return await run_script("research.js")


async def resources_and_trade() -> dict[str, Any]:
    return await run_script("commerce.js")


async def units() -> dict[str, Any]:
    return await run_script("units.js")


async def known_world() -> dict[str, Any]:
    return await run_script("known_world.js")


async def victory_progress() -> dict[str, Any]:
    return await run_script("victory.js")


async def diplomacy() -> dict[str, Any]:
    return await run_script("diplomacy.js")


async def visible_threats() -> dict[str, Any]:
    return await run_script("threats.js")


async def turn_context() -> dict[str, Any]:
    return await run_script("turn_context.js")


async def explored_map() -> dict[str, Any]:
    return await run_script("map.js")
