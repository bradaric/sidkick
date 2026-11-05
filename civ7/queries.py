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


async def religion() -> dict[str, Any]:
    return await run_script("religion.js")


async def great_works(great_work_index: int | None = None) -> dict[str, Any]:
    """Read owned work inventory, optionally checking one owned instance's destinations."""
    if great_work_index is not None and (type(great_work_index) is not int or great_work_index < 0):
        raise ValueError("A nonnegative owned Great Work instance index is required")
    return await run_script("great_works.js", {"great_work_index": great_work_index})


async def resources_and_trade() -> dict[str, Any]:
    return await run_script("commerce.js")


async def units() -> dict[str, Any]:
    return await run_script("units.js")


async def movement_and_founding(
    unit_id: int, x: int | None = None, y: int | None = None,
) -> dict[str, Any]:
    """Read one owned unit's movement and optional revealed-site evidence."""
    if type(unit_id) is not int or unit_id < 0:
        raise ValueError("A nonnegative owned unit instance ID is required")
    if (x is None) != (y is None):
        raise ValueError("Supply x and y together")
    if x is not None and (type(x) is not int or type(y) is not int or x < 0 or y < 0):
        raise ValueError("Coordinates must be nonnegative integers")
    return await run_script("movement.js", {"unit_id": unit_id, "x": x, "y": y})


async def combat_options(unit_id: int, x: int, y: int) -> dict[str, Any]:
    """Read attack eligibility against a currently visible hostile target."""
    if any(type(value) is not int or value < 0 for value in (unit_id, x, y)):
        raise ValueError("Unit instance ID and coordinates must be nonnegative integers")
    return await run_script("combat.js", {"unit_id": unit_id, "x": x, "y": y})


async def known_world() -> dict[str, Any]:
    return await run_script("known_world.js")


async def victory_progress() -> dict[str, Any]:
    return await run_script("victory.js")


async def diplomacy() -> dict[str, Any]:
    return await run_script("diplomacy.js")


async def city_states() -> dict[str, Any]:
    return await run_script("city_states.js")


async def visible_threats() -> dict[str, Any]:
    return await run_script("threats.js")


async def turn_context() -> dict[str, Any]:
    return await run_script("turn_context.js")


async def age_transition() -> dict[str, Any]:
    return await run_script("age_transition.js")


async def explored_map() -> dict[str, Any]:
    return await run_script("map.js")
