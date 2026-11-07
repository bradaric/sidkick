"""Focused read-only Civ VII strategy queries."""

from typing import Any

from pydantic import StrictInt, StrictStr

from civ7.connection import run_script


async def empire() -> dict[str, Any]:
    return await run_script("empire.js")


async def civilopedia(
    query: StrictStr | None = None, section_id: StrictStr | None = None,
    page_id: StrictStr | None = None, limit: StrictInt = 10, offset: StrictInt = 0,
) -> dict[str, Any]:
    """Search/browse loaded public Civilopedia pages, or read one exact article."""
    if (any(value is not None and (not isinstance(value, str) or not value.strip() or len(value) > 200)
            for value in (query, section_id, page_id))
            or page_id is not None and (section_id is None or query is not None)
            or type(limit) is not int or not 1 <= limit <= 20
            or type(offset) is not int or not 0 <= offset <= 10000):
        raise ValueError("Bounded search text, a section, or exact section/page IDs required")
    return await run_script("civilopedia.js", {
        "query": query, "section_id": section_id, "page_id": page_id, "limit": limit, "offset": offset,
    })


async def peace_city_offer(target_player_id: int, city_owner: int, city_id: int, x: int, y: int) -> dict[str, Any]:
    """Read native peace offers only for one exact currently visible owner-qualified centre."""
    if any(type(v) is not int or v<0 for v in (target_player_id,city_owner,city_id,x,y)):
        raise ValueError("Exact known counterpart and visible city owner/ID/coordinates required")
    return await run_script("peace_city_offer.js",{"target_player_id":target_player_id,"city_owner":city_owner,"city_id":city_id,"x":x,"y":y})


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


async def archaeology() -> dict[str, Any]:
    """Read revealed archaeology candidates and owned Explorer readiness."""
    return await run_script("archaeology.js")


async def resources_and_trade() -> dict[str, Any]:
    return await run_script("commerce.js")


async def units() -> dict[str, Any]:
    return await run_script("units.js")


async def military_logistics(unit_id: int | None = None) -> dict[str, Any]:
    """Read owned logistics inventory, optionally checking one unit's destinations."""
    if unit_id is not None and (type(unit_id) is not int or unit_id < 0):
        raise ValueError("A nonnegative owned unit instance ID is required")
    return await run_script("logistics.js", {"unit_id": unit_id})


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


async def ascii_map(x: StrictInt, y: StrictInt, width: StrictInt = 15, height: StrictInt = 9) -> dict[str, Any]:
    """Render a bounded view of explored terrain with currently visible entity overlays."""
    if (any(type(value) is not int for value in (x, y, width, height)) or x < 0 or y < 0
            or not 1 <= width <= 31 or width % 2 != 1 or not 1 <= height <= 21 or height % 2 != 1):
        raise ValueError("Nonnegative center coordinates and odd width 1-31 / height 1-21 are required")
    return await run_script("ascii_map.js", {"x": x, "y": y, "width": width, "height": height})
