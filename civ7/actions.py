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
_TURN_VERIFICATION_TIMEOUT = 60.0
_COMBAT_VERIFICATION_TIMEOUT = 15.0


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


async def unassign_resource(resource_instance: StrictInt, off_map: StrictBool, settlement: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Unassign one exact owned resource only from its explicit current source settlement."""
    if type(resource_instance) is not int or resource_instance < 0 or type(off_map) is not bool or type(expected_turn) is not int or expected_turn < 0 or not isinstance(settlement, str) or not settlement.strip():
        raise ValueError("An exact resource/off-map identity, source settlement and expected turn are required")
    args = {"resource_instance": resource_instance, "off_map": off_map, "settlement": settlement.strip(), "expected_turn": expected_turn, "mode": "unassign"}
    return await _execute_and_verify("assign_resource.js", args, "resource_assignment_state.js", state_arguments=args)


async def swap_resources(first_resource_instance: StrictInt, first_off_map: StrictBool, second_resource_instance: StrictInt, second_off_map: StrictBool, expected_turn: StrictInt) -> dict[str, Any]:
    """Atomically swap two exact assigned resources while preserving the entire owned ledger."""
    if any(type(v) is not int or v < 0 for v in (first_resource_instance, second_resource_instance, expected_turn)) or any(type(v) is not bool for v in (first_off_map, second_off_map)) or (first_resource_instance, first_off_map) == (second_resource_instance, second_off_map):
        raise ValueError("Two distinct exact resource/off-map identities and expected turn are required")
    return await _execute_and_verify("swap_resources.js", {
        "first_resource_instance": first_resource_instance, "first_off_map": first_off_map,
        "second_resource_instance": second_resource_instance, "second_off_map": second_off_map, "expected_turn": expected_turn,
    }, "resource_swap_state.js")


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


async def edit_production_queue(settlement: StrictStr, queue_token: StrictStr, action: Literal["cancel", "swap"], index: StrictInt, expected_turn: StrictInt, other_index: StrictInt | None = None) -> dict[str, Any]:
    """Cancel one exact queued order or swap adjacent entries using a captured whole-queue token."""
    if (not isinstance(settlement, str) or not settlement.strip() or not isinstance(queue_token, str) or
            not queue_token or len(queue_token) > 100000 or action not in ("cancel", "swap") or
            any(type(v) is not int or v < 0 for v in (index, expected_turn)) or
            (action == "cancel" and other_index is not None) or
            (action == "swap" and (type(other_index) is not int or other_index < 0 or abs(index - other_index) != 1))):
        raise ValueError("An exact settlement/queue token, supported edit indices and expected turn are required")
    return await _execute_and_verify("edit_production_queue.js", {
        "settlement": settlement.strip(), "queue_token": queue_token, "action": action, "index": index, "other_index": other_index, "expected_turn": expected_turn,
    }, "production_queue_state.js")


async def establish_trade_route(
    unit_id: StrictInt, target_player_id: StrictInt, target_city_id: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Establish one direct Merchant route, never silently falling back to movement."""
    if any(type(value) is not int or value < 0 for value in (unit_id, target_player_id, target_city_id, expected_turn)):
        raise ValueError("Nonnegative owned Merchant, target player/city IDs and expected turn are required")
    arguments = {"unit_id": unit_id, "target_player_id": target_player_id,
                 "target_city_id": target_city_id, "expected_turn": expected_turn}
    return await _execute_and_verify("establish_trade_route.js", arguments, "trade_route_state.js")


async def place_population(
    settlement: StrictStr, x: StrictInt, y: StrictInt, improvement: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Place one pending population on a native-offered ordinary improvement tile."""
    if not isinstance(settlement, str) or not settlement.strip() or not isinstance(improvement, str) or not improvement.strip():
        raise ValueError("An exact owned settlement name and improvement type ID are required")
    if any(type(value) is not int or value < 0 for value in (x, y, expected_turn)):
        raise ValueError("Nonnegative tile coordinates and expected turn are required")
    arguments = {"settlement": settlement.strip(), "x": x, "y": y,
                 "improvement": improvement.strip(), "expected_turn": expected_turn}
    return await _execute_and_verify("place_population.js", arguments, "population_state.js")


async def move_unit(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Move one owned unit a single visible, empty, noncombat land/sea step."""
    if any(type(value) is not int or value < 0 for value in (unit_id, x, y, expected_turn)):
        raise ValueError("Nonnegative owned unit ID, tile coordinates and expected turn are required")
    arguments = {"unit_id": unit_id, "x": x, "y": y, "expected_turn": expected_turn}
    return await _execute_and_verify("move_unit.js", arguments, "unit_position_state.js")


async def rail_unit(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Rail one unpacked ordinary land unit to an exact visible owned native-offered tile."""
    if any(type(v) is not int or v < 0 for v in (unit_id, x, y, expected_turn)):
        raise ValueError("An exact owned unit, destination and expected turn are required")
    return await _execute_and_verify("move_unit.js", {
        "unit_id": unit_id, "x": x, "y": y, "expected_turn": expected_turn, "mode": "rail",
    }, "unit_position_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def set_town_focus(settlement: StrictStr, focus: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Select an offered town focus or return to Growing Town."""
    if not isinstance(focus, str) or not focus.strip():
        raise ValueError("An exact offered focus ID or GROWTH is required")
    return await _manage_settlement({"mode": "focus", "settlement": settlement,
                                     "focus": focus.strip(), "expected_turn": expected_turn})


async def upgrade_town(settlement: StrictStr, max_gold_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Buy the native town-to-city upgrade under an explicit Gold cap."""
    if type(max_gold_cost) not in (int, float) or not math.isfinite(max_gold_cost) or max_gold_cost < 0:
        raise ValueError("A finite nonnegative Gold cap is required")
    return await _manage_settlement({"mode": "upgrade", "settlement": settlement,
                                     "max_gold_cost": max_gold_cost, "expected_turn": expected_turn})


async def assign_specialist(settlement: StrictStr, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Spend one pending population in one unblocked owned city specialist slot."""
    if any(type(v) is not int or v < 0 for v in (x, y)):
        raise ValueError("Nonnegative integer tile coordinates are required")
    return await _manage_settlement({"mode": "specialist", "settlement": settlement,
                                     "x": x, "y": y, "expected_turn": expected_turn})


async def _manage_settlement(arguments: dict[str, Any]) -> dict[str, Any]:
    settlement, turn = arguments["settlement"], arguments["expected_turn"]
    if not isinstance(settlement, str) or not settlement.strip():
        raise ValueError("An exact owned settlement name is required")
    if type(turn) is not int or turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    return await _execute_and_verify("settlement_management.js", {**arguments, "settlement": settlement.strip()},
                                     "settlement_management_state.js")


async def set_unit_order(
    unit_id: StrictInt, order: Literal["skip", "sleep", "wake", "fortify", "heal", "alert", "cancel"], expected_turn: StrictInt,
) -> dict[str, Any]:
    """Issue one bounded non-target unit order without replacing queued orders implicitly."""
    if any(type(v) is not int or v < 0 for v in (unit_id, expected_turn)) or not isinstance(order, str) or order not in {
        "skip", "sleep", "wake", "fortify", "heal", "alert", "cancel",
    }:
        raise ValueError("An owned unit, supported non-target order and expected turn are required")
    return await _execute_and_verify("unit_order.js", {"unit_id": unit_id, "order": order, "expected_turn": expected_turn},
                                     "unit_order_state.js")


async def end_turn(expected_turn: StrictInt) -> dict[str, Any]:
    """Submit one unblocked single-player turn and await the next active local turn."""
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    async with _action_lock:
        result = {"status": "unknown", "expected_turn": expected_turn}
        after = None
        try:
            result = await run_script("end_turn.js", {"expected_turn": expected_turn})
            if result.get("status") == "rejected":
                return result
            if result.get("status") != "submitted":
                raise ValueError("Unexpected turn submission response")
            before = result["before"]
            if before.get("turn") != expected_turn or any(type(before.get(k)) is not int for k in ("turn", "age", "playerId")):
                raise ValueError("Unverified pre-submit turn identity")
            async with asyncio.timeout(_TURN_VERIFICATION_TIMEOUT):
                while True:
                    after = await run_script("turn_state.js")
                    if any(type(after.get(k)) is not int or after[k] != before[k] for k in ("age", "playerId")) or \
                            type(after.get("turn")) is not int or after["turn"] not in (expected_turn, expected_turn + 1):
                        return {**result, "status": "unknown", "after": after,
                                "reason": "Unexpected player/Age/turn boundary; never retry automatically"}
                    if after["turn"] == expected_turn + 1 and after.get("active") is True and after.get("sent") is False:
                        return {**result, "status": "verified_applied", "after": after}
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            return {**result, "status": "unknown", **({"after": after} if after is not None else {}),
                    "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Turn outcome is unknown; inspect current state and do not retry automatically"}


async def choose_government(government: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Resolve a pending government picker using a current-Age offered government ID."""
    return await _mandatory_choice("government", government, expected_turn)


async def choose_celebration(celebration: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Resolve one pending native celebration choice."""
    return await _mandatory_choice("celebration", celebration, expected_turn)


async def review_resources(expected_turn: StrictInt) -> dict[str, Any]:
    """Acknowledge the native resource-review prompt without changing assignments."""
    return await _mandatory_choice("resource_review", None, expected_turn)


async def review_policies(expected_turn: StrictInt) -> dict[str, Any]:
    """Acknowledge the native policy review screen without changing any cards."""
    return await _mandatory_choice("policy_review", None, expected_turn)


async def _mandatory_choice(mode: str, selection: str | None, expected_turn: int) -> dict[str, Any]:
    if type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("A nonnegative expected turn is required")
    arguments = {"mode": mode, "expected_turn": expected_turn}
    if mode in {"government", "celebration"}:
        if not isinstance(selection, str) or not selection.strip():
            raise ValueError("An exact offered choice ID is required")
        arguments["selection"] = selection.strip()
    return await _execute_and_verify("mandatory_choice.js", arguments, "mandatory_choice_state.js")


async def acknowledge_agenda(notification_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Acknowledge exactly one local agenda message, never a project or deal response."""
    if any(type(v) is not int or v < 0 for v in (notification_id, expected_turn)):
        raise ValueError("A local agenda notification ID and expected turn are required")
    return await _execute_and_verify("acknowledge_agenda.js", {"notification_id": notification_id, "expected_turn": expected_turn},
                                     "agenda_state.js")


async def set_culture_card(
    card: StrictStr, active: StrictBool, slot: Literal["policy", "tradition", "crisis"], expected_turn: StrictInt,
) -> dict[str, Any]:
    """Change one explicitly selected card group without implicit swaps or migration."""
    if not isinstance(card, str) or not card.strip() or type(active) is not bool or slot not in (
        "policy", "tradition", "crisis",
    ) or type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("An exact card ID, boolean active flag, supported slot group and expected turn are required")
    return await _execute_and_verify("set_culture_card.js", {
        "card": card.strip(), "active": active, "slot": slot, "expected_turn": expected_turn,
    }, "policy_state.js")


async def choose_narrative(
    instance_id: StrictInt, instance_type: StrictInt, choice: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Resolve one offered zero-definition-cost non-trial pending narrative choice."""
    if any(type(v) is not int or v < 0 for v in (instance_id, instance_type, expected_turn)) or \
            not isinstance(choice, str) or not choice.strip():
        raise ValueError("A pending narrative instance, exact offered choice ID and expected turn are required")
    return await _execute_and_verify("choose_narrative.js", {
        "instance_id": instance_id, "instance_type": instance_type, "choice": choice.strip(), "expected_turn": expected_turn,
    }, "narrative_state.js")


async def respond_diplomatic_project(
    action_id: StrictInt, response: Literal["accept", "support", "reject"], max_influence_cost: StrictFloat, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Respond once to one incoming cooperative project under a fresh native Influence quote."""
    if any(type(v) is not int or v < 0 for v in (action_id, expected_turn)) or response not in ("accept", "support", "reject") or \
            type(max_influence_cost) not in (int, float) or not math.isfinite(max_influence_cost) or max_influence_cost < 0:
        raise ValueError("An incoming project ID, supported response, finite nonnegative Influence cap and expected turn are required")
    return await _execute_and_verify("respond_diplomatic_project.js", {
        "action_id": action_id, "response": response, "max_influence_cost": max_influence_cost, "expected_turn": expected_turn,
    }, "diplomatic_response_state.js")


async def promote_unit(unit_id: StrictInt, discipline: StrictStr, promotion: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Spend earned points on one exact native class/discipline promotion."""
    if any(type(v) is not int or v < 0 for v in (unit_id, expected_turn)) or any(
        not isinstance(v, str) or not v.strip() for v in (discipline, promotion)
    ):
        raise ValueError("An owned unit, exact discipline/promotion IDs and expected turn are required")
    return await _execute_and_verify("promote_unit.js", {
        "unit_id": unit_id, "discipline": discipline.strip(), "promotion": promotion.strip(), "expected_turn": expected_turn,
    }, "unit_promotion_state.js")


async def upgrade_unit(unit_id: StrictInt, target_unit_type: StrictStr, max_gold_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Upgrade one deployed unit under the exact supported native price and explicit target/cap."""
    if any(type(v) is not int or v < 0 for v in (unit_id, expected_turn)) or not isinstance(target_unit_type, str) or not target_unit_type.strip() or \
            type(max_gold_cost) not in (int, float) or not math.isfinite(max_gold_cost) or max_gold_cost < 0:
        raise ValueError("An owned unit, target type ID, finite nonnegative Gold cap and expected turn are required")
    return await _execute_and_verify("upgrade_unit.js", {
        "unit_id": unit_id, "target_unit_type": target_unit_type.strip(), "max_gold_cost": max_gold_cost, "expected_turn": expected_turn,
    }, "unit_upgrade_state.js")


async def pack_commander(commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Pack all native-eligible nearby friendly units into one commander."""
    if any(type(v) is not int or v < 0 for v in (commander_id, expected_turn)):
        raise ValueError("An owned commander ID and expected turn are required")
    return await _execute_and_verify("commander_action.js", {
        "mode": "pack", "commander_id": commander_id, "expected_turn": expected_turn,
    }, "commander_action_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def unpack_commander(commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Deploy packed units using a visible owned native-offered unpack plot."""
    if any(type(v) is not int or v < 0 for v in (commander_id, x, y, expected_turn)):
        raise ValueError("An owned commander, deployment tile and expected turn are required")
    return await _execute_and_verify("commander_action.js", {
        "mode": "unpack", "commander_id": commander_id, "x": x, "y": y, "expected_turn": expected_turn,
    }, "commander_action_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def move_commander(
    commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, max_steps: StrictInt = 1,
) -> dict[str, Any]:
    """Move a commander and its captured packed members over a bounded current-turn path."""
    if any(type(v) is not int or v < 0 for v in (commander_id, x, y, expected_turn)) or type(max_steps) is not int or not 1 <= max_steps <= 8:
        raise ValueError("An owned commander, destination, expected turn and max_steps from 1 through 8 are required")
    return await _execute_and_verify("commander_action.js", {
        "mode": "move", "commander_id": commander_id, "x": x, "y": y, "expected_turn": expected_turn, "max_steps": max_steps,
    }, "commander_action_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def rail_commander(commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Move an exact land commander and captured army using native rail permission only."""
    if any(type(v) is not int or v < 0 for v in (commander_id, x, y, expected_turn)):
        raise ValueError("An owned commander, exact destination and expected turn are required")
    return await _execute_and_verify("commander_action.js", {
        "mode": "rail", "commander_id": commander_id, "x": x, "y": y, "expected_turn": expected_turn,
    }, "commander_action_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def reinforce_unit(unit_id: StrictInt, commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Start native travel to one owned commander's army and verify assignment, not arrival."""
    if any(type(v) is not int or v < 0 for v in (unit_id, commander_id, expected_turn)) or unit_id == commander_id:
        raise ValueError("Distinct owned unit/commander IDs and expected turn are required")
    return await _execute_and_verify("reinforce_unit.js", {
        "unit_id": unit_id, "commander_id": commander_id, "expected_turn": expected_turn,
    }, "reinforcement_state.js")


async def attack_unit(
    unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt,
    kind: Literal["melee", "ranged"], expected_turn: StrictInt,
) -> dict[str, Any]:
    """Attack one exact visible enemy combat unit in an existing war, once."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)) or kind not in ("melee", "ranged"):
        raise ValueError("Exact attacker, target identity/tile, melee/ranged kind and expected turn are required")
    return await _execute_and_verify("attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id,
        "x": x, "y": y, "kind": kind, "expected_turn": expected_turn,
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def naval_attack_unit(
    unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Submit the native naval operation against one exact visible hostile combat ship."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact naval attacker, enemy identity/tile and expected turn are required")
    return await _execute_and_verify("attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id,
        "x": x, "y": y, "expected_turn": expected_turn, "kind": "naval",
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def ranged_attack_enemy_field(
    unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Attack a visible enemy-owned non-city field without entry/capture or implicit war."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact attacker, enemy identity/tile and expected turn are required")
    return await _execute_and_verify("attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id, "x": x, "y": y,
        "expected_turn": expected_turn, "kind": "ranged", "target_territory": "enemy_field",
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def join_commander(unit_id: StrictInt, commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Add one explicit nearby land unit to an owned commander, preserving other memberships."""
    if any(type(v) is not int or v < 0 for v in (unit_id, commander_id, expected_turn)) or unit_id == commander_id:
        raise ValueError("Distinct owned unit/commander IDs and expected turn are required")
    return await _execute_and_verify("unit_membership.js", {
        "mode": "join", "unit_id": unit_id, "commander_id": commander_id, "expected_turn": expected_turn,
    }, "unit_membership_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def leave_commander(unit_id: StrictInt, commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Remove one explicit packed land unit onto a native-offered adjacent empty plot."""
    if any(type(v) is not int or v < 0 for v in (unit_id, commander_id, x, y, expected_turn)) or unit_id == commander_id:
        raise ValueError("Distinct owned unit/commander IDs, deployment tile and expected turn are required")
    return await _execute_and_verify("unit_membership.js", {
        "mode": "leave", "unit_id": unit_id, "commander_id": commander_id, "x": x, "y": y, "expected_turn": expected_turn,
    }, "unit_membership_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def join_fleet(unit_id: StrictInt, commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Add one nearby naval combat unit to an exact Fleet Commander on water."""
    if any(type(v) is not int or v < 0 for v in (unit_id, commander_id, expected_turn)) or unit_id == commander_id:
        raise ValueError("Distinct owned naval unit/Fleet Commander IDs and expected turn are required")
    return await _execute_and_verify("unit_membership.js", {
        "mode": "join", "domain": "DOMAIN_SEA", "unit_id": unit_id, "commander_id": commander_id, "expected_turn": expected_turn,
    }, "unit_membership_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def leave_fleet(unit_id: StrictInt, commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Deploy one captured naval combat member to an adjacent empty water tile."""
    if any(type(v) is not int or v < 0 for v in (unit_id, commander_id, x, y, expected_turn)) or unit_id == commander_id:
        raise ValueError("Distinct owned naval unit/Fleet Commander IDs, destination and expected turn are required")
    return await _execute_and_verify("unit_membership.js", {
        "mode": "leave", "domain": "DOMAIN_SEA", "unit_id": unit_id, "commander_id": commander_id, "x": x, "y": y, "expected_turn": expected_turn,
    }, "unit_membership_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def rebase_aircraft(unit_id: StrictInt, target_city_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Rebase one deployed aircraft to an exact visible owned city centre offered natively."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_city_id, expected_turn)):
        raise ValueError("Exact owned aircraft/city IDs and expected turn are required")
    return await _execute_and_verify("rebase_unit.js", {
        "unit_id": unit_id, "target_city_id": target_city_id, "expected_turn": expected_turn,
    }, "unit_rebase_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def army_ranged_attack(
    commander_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Order native focused land-ranged fire; verify captured participant/primary-target effects."""
    if any(type(v) is not int or v < 0 for v in (commander_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact commander, enemy identity/tile and expected turn are required")
    return await _execute_and_verify("army_attack.js", {
        "commander_id": commander_id, "target_player": target_player, "target_unit_id": target_unit_id,
        "x": x, "y": y, "expected_turn": expected_turn, "attack_kind": "ranged",
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def army_melee_attack(
    commander_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Order native coordinated attacks by directly adjacent Infantry/Cavalry participants."""
    if any(type(v) is not int or v < 0 for v in (commander_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact commander, enemy identity/tile and expected turn are required")
    return await _execute_and_verify("army_attack.js", {
        "commander_id": commander_id, "target_player": target_player, "target_unit_id": target_unit_id,
        "x": x, "y": y, "expected_turn": expected_turn, "attack_kind": "melee",
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def army_overrun(
    commander_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Overrun one exact adjacent visible enemy using native packed-army eligibility only."""
    if any(type(v) is not int or v < 0 for v in (commander_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact commander, enemy identity/tile and expected turn are required")
    return await _execute_and_verify("army_overrun.js", {
        "commander_id": commander_id, "target_player": target_player, "target_unit_id": target_unit_id,
        "x": x, "y": y, "expected_turn": expected_turn,
    }, "commander_action_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def upgrade_army(commander_id: StrictInt, max_gold_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Upgrade every captured packed member using reconciled native member and group quotes."""
    if any(type(v) is not int or v < 0 for v in (commander_id, expected_turn)) or type(max_gold_cost) not in (int, float) or not math.isfinite(max_gold_cost) or max_gold_cost < 0:
        raise ValueError("An exact owned commander, finite Gold cap and expected turn are required")
    return await _execute_and_verify("upgrade_army.js", {
        "commander_id": commander_id, "max_gold_cost": max_gold_cost, "expected_turn": expected_turn,
    }, "army_upgrade_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def grant_second_wind(commander_id: StrictInt, unit_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Grant native Second Wind to one unambiguous deployed land combat recipient."""
    if any(type(v) is not int or v < 0 for v in (commander_id, unit_id, expected_turn)) or commander_id == unit_id:
        raise ValueError("Distinct owned commander/recipient IDs and expected turn are required")
    return await _execute_and_verify("second_wind.js", {
        "commander_id": commander_id, "unit_id": unit_id, "expected_turn": expected_turn,
    }, "second_wind_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def _execute_and_verify(
    action_script: str, arguments: dict[str, Any], state_script: str,
    expected_fields: dict[str, Any] | None = None,
    state_arguments: dict[str, Any] | None = None,
    *, verification_timeout: float | None = None,
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
            async with asyncio.timeout(_VERIFICATION_TIMEOUT if verification_timeout is None else verification_timeout):
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
