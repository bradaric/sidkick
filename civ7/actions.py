"""Explicit gameplay actions; registered only by the write-enabled server."""

import asyncio
import math
from typing import Any, Literal

from pydantic import StrictBool, StrictFloat, StrictInt, StrictStr

from civ7.connection import run_script


# Serialize submission and readback within this process, not across MCP servers.
_action_lock = asyncio.Lock()
_VERIFICATION_TIMEOUT = 2.0
_VERIFICATION_INTERVAL = 0.1


async def select_technology(technology: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Select one technology and verify active research without resubmission."""
    return await _select_research(technology, expected_turn, "technology")


async def select_civic(civic: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Select one civic and verify active research without resubmission."""
    return await _select_research(civic, expected_turn, "civic")


async def _select_research(
    selection: str, expected_turn: int, kind: Literal["technology", "civic"],
) -> dict[str, Any]:
    if not isinstance(selection, str) or not selection.strip():
        raise ValueError(f"An exact {kind} type ID is required")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    selection = selection.strip()
    active_field = "activeTechnology" if kind == "technology" else "activeCivic"
    return await _execute_and_verify(
        f"select_{kind}.js", {kind: selection, "expected_turn": expected_turn},
        f"{kind}_state.js", {active_field: selection},
    )


async def set_policy_active(policy: StrictStr, active: StrictBool, expected_turn: StrictInt) -> dict[str, Any]:
    """Enable/disable one ordinary card without swapping or migrating other cards."""
    if not isinstance(policy, str) or not policy.strip():
        raise ValueError("An exact ordinary-policy type ID is required")
    if type(active) is not bool:
        raise ValueError("The active flag must be a boolean")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    return await _execute_and_verify(
        "set_policy_active.js", {"policy": policy.strip(), "active": active, "expected_turn": expected_turn},
        "policy_state.js",
    )


async def assign_resource(
    resource_instance: StrictInt, off_map: StrictBool, settlement: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Assign one proven-owned resource without swaps or bulk clearing."""
    if type(resource_instance) is not int or resource_instance < 0 or type(off_map) is not bool:
        raise ValueError("A nonnegative resource instance and boolean off_map flag are required")
    if not isinstance(settlement, str) or not settlement.strip():
        raise ValueError("An exact owned settlement name is required")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    arguments = {"resource_instance": resource_instance, "off_map": off_map,
                 "settlement": settlement.strip(), "expected_turn": expected_turn}
    return await _execute_and_verify(
        "assign_resource.js", arguments, "resource_assignment_state.js", state_arguments=arguments,
    )


async def buy_attribute_node(node: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Buy a first nonrepeatable leader perk using native point eligibility."""
    if not isinstance(node, str) or not node.strip():
        raise ValueError("An exact attribute node ID is required")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    arguments = {"node": node.strip(), "expected_turn": expected_turn}
    return await _execute_and_verify(
        "buy_attribute_node.js", arguments, "attribute_node_state.js", state_arguments=arguments,
    )


async def move_great_work(
    great_work_index: StrictInt, destination_city_id: StrictInt,
    destination_building: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Move one owned Great Work to a compatible empty owned building slot."""
    if any(type(value) is not int or value < 0 for value in (great_work_index, destination_city_id, expected_turn)):
        raise ValueError("Nonnegative work instance, owned city ID and expected turn are required")
    if not isinstance(destination_building, str) or not destination_building.strip():
        raise ValueError("An exact destination building type ID is required")
    arguments = {"great_work_index": great_work_index, "destination_city_id": destination_city_id,
                 "destination_building": destination_building.strip(), "expected_turn": expected_turn}
    return await _execute_and_verify(
        "move_great_work.js", arguments, "great_work_location_state.js", state_arguments=arguments,
    )


async def start_diplomatic_project(
    target_player_id: StrictInt, action: StrictStr, max_influence_cost: StrictFloat, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Start one supported cooperative project with a met major player."""
    return await _start_project("major", target_player_id, action, max_influence_cost, expected_turn)


async def start_city_state_project(
    target_player_id: StrictInt, action: StrictStr, max_influence_cost: StrictFloat, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Start one supported city-state project, including incorporation."""
    return await _start_project("city-state", target_player_id, action, max_influence_cost, expected_turn)


async def _start_project(
    kind: Literal["major", "city-state"], target_player_id: int, action: str,
    max_influence_cost: float, expected_turn: int,
) -> dict[str, Any]:
    if type(target_player_id) is not int or target_player_id < 0:
        raise ValueError("A nonnegative target player ID is required")
    if not isinstance(action, str) or not action.strip():
        raise ValueError("An exact supported diplomatic action ID is required")
    if type(max_influence_cost) not in (int, float) or not math.isfinite(max_influence_cost) or max_influence_cost < 0:
        raise ValueError("A finite nonnegative Influence cap is required")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    arguments = {"target_kind": kind, "target_player_id": target_player_id, "action": action.strip(),
                 "max_influence_cost": max_influence_cost, "expected_turn": expected_turn}
    return await _execute_and_verify("start_diplomatic_project.js", arguments, "diplomatic_project_state.js")


async def append_city_production(
    settlement: StrictStr, item: StrictStr, expected_turn: StrictInt,
    x: StrictInt | None = None, y: StrictInt | None = None,
) -> dict[str, Any]:
    """Append one unit, building or project without replacing an existing city queue."""
    return await _city_construction("append", settlement, item, expected_turn, x, y, None)


async def purchase_city_item(
    settlement: StrictStr, item: StrictStr, max_gold_cost: StrictFloat, expected_turn: StrictInt,
    x: StrictInt | None = None, y: StrictInt | None = None,
) -> dict[str, Any]:
    """Purchase one unit or non-overbuilding building in an owned city or town."""
    return await _city_construction("purchase", settlement, item, expected_turn, x, y, max_gold_cost)


async def _city_construction(
    mode: Literal["append", "purchase"], settlement: str, item: str, expected_turn: int,
    x: int | None, y: int | None, cap: float | None,
) -> dict[str, Any]:
    if not isinstance(settlement, str) or not settlement.strip() or not isinstance(item, str) or not item.strip():
        raise ValueError("An exact owned settlement name and item type ID are required")
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    if (x is not None or y is not None) and any(type(value) is not int or value < 0 for value in (x, y)):
        raise ValueError("Supply both nonnegative integer x and y, or omit both")
    if mode == "purchase" and (type(cap) not in (int, float) or not math.isfinite(cap) or cap < 0):
        raise ValueError("A finite nonnegative Gold cap is required")
    arguments = {"mode": mode, "settlement": settlement.strip(), "item": item.strip(),
                 "expected_turn": expected_turn, "x": x, "y": y, "max_gold_cost": cap}
    return await _execute_and_verify("apply_city_construction.js", arguments, "city_construction_state.js")


async def _execute_and_verify(
    action_script: str, arguments: dict[str, Any], state_script: str,
    expected_fields: dict[str, Any] | None = None,
    state_arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # Only the typed wrappers above select these fixed scripts and expectations.
    async with _action_lock:
        result = {"status": "unknown", **arguments}
        after = None
        try:
            result = await run_script(action_script, arguments)
            if result.get("status") in {"rejected", "already_active", "already_inactive"}:
                return result
            if result.get("status") != "submitted":
                return {**result, "status": "unknown", "reason": "Unexpected action response; do not retry automatically"}
            before = result.get("before", {})
            expected = expected_fields if expected_fields is not None else result.get("expected")
            if not isinstance(expected, dict) or not expected:
                raise ValueError("Missing action verification expectations")
            read_arguments = result.get("verificationArguments", state_arguments)
            if read_arguments is not None and not isinstance(read_arguments, dict):
                raise ValueError("Invalid action verification arguments")
            async with asyncio.timeout(_VERIFICATION_TIMEOUT):
                while True:
                    after = (await run_script(state_script) if read_arguments is None
                             else await run_script(state_script, read_arguments))
                    same_context = all(type(before.get(key)) is int and type(after.get(key)) is int
                                       and before[key] == after[key] for key in ("turn", "age", "playerId"))
                    if not same_context:
                        return {**result, "status": "unknown", "after": after,
                                "reason": "Game context changed or is unverified; do not retry automatically"}
                    if all(key in after and after[key] == value for key, value in expected.items()):
                        return {**result, "status": "verified_applied", "after": after}
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            # A timeout/disconnect can follow a successful native submission.
            # Cancellation still propagates, and must also never trigger a retry.
            return {**result, "status": "unknown", **({"after": after} if after is not None else {}),
                    "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Action outcome is unknown; inspect current state before issuing another action"}
