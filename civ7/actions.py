"""Explicit gameplay actions; registered only by the write-enabled server."""

import asyncio
import math
import re
from typing import Any, Literal
from uuid import uuid4

from pydantic import StrictBool, StrictFloat, StrictInt, StrictStr

# Gameplay submissions/readbacks retain the loading gate; the fixed menu loader has its own guard.
from civ7.connection import run_started_script as run_script
from civ7.connection import run_load_game_script
from civ7.connection import run_transition_loading_script
from civ7.save_games import read_save_inventory


# Serialize submission and readback within this process, not across MCP servers.
_action_lock = asyncio.Lock()
_VERIFICATION_TIMEOUT = 2.0
_VERIFICATION_INTERVAL = 0.1
_TURN_VERIFICATION_TIMEOUT = 60.0
_COMBAT_VERIFICATION_TIMEOUT = 15.0
_TRANSITION_TIMEOUT = 60.0


async def save_game(save_name: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Create one new local single-player save; no overwrite or automatic retry."""
    if (not isinstance(save_name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _-]{0,79}", save_name)
            or save_name != save_name.strip() or re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", save_name, re.I)
            or type(expected_turn) is not int or expected_turn < 0):
        raise ValueError("Safe new save name (1–80 ASCII letters/digits/spaces/_/-) and expected turn required")
    async with _action_lock:
        result = {"status": "unknown"}
        try:
            inventory = await read_save_inventory()
            if inventory.get("status") != "ready":
                return inventory
            result = await run_script("save_load.js", {"operation": "save", "save_name": save_name,
                "expected_turn": expected_turn, "inventory_id": inventory["inventoryId"], "request_id": uuid4().hex})
            if result.get("status") != "submitted":
                return result
            before = result["before"]
            async with asyncio.timeout(15):
                while True:
                    state = await run_script("save_load.js", {"operation": "save_state", "request_id": result["requestId"]})
                    if state.get("context") != before or state.get("status") != "ready":
                        raise ValueError("Game context or save observation changed")
                    if state.get("serializerComplete") is True:
                        if state.get("serializerOk") is not True:
                            return {**result, "status": "unknown", "after": state,
                                    "reason": "Native save did not confirm success; inspect saves and never retry automatically"}
                        after = await read_save_inventory()
                        matches = [f for f in after.get("saves", []) if f.get("fileName", "").lower() == f"{save_name}.Civ7Save".lower()
                                   and f.get("currentTurn") == before.get("turn") and f.get("age") == before.get("ageType")]
                        if after.get("status") == "ready" and after.get("context") == before and len(matches) == 1:
                            return {**result, "status": "verified_applied", "save": matches[0], "after": state}
                        raise ValueError("Serializer succeeded but the exact new save metadata is unverified")
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            return {**result, "status": "unknown", "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Save outcome is unverified; inspect saves and never retry automatically"}


async def load_game(
    save_token: StrictStr, confirm_discard_unsaved_progress: StrictBool, expected_turn: StrictInt | None = None,
) -> dict[str, Any]:
    """Request one exact listed local save from game or menu; acceptance is not completed loading."""
    if (not isinstance(save_token, str) or not save_token or len(save_token) > 100000
            or confirm_discard_unsaved_progress is not True
            or expected_turn is not None and (type(expected_turn) is not int or expected_turn < 0)):
        raise ValueError("Exact fresh save token, explicit discard confirmation and current turn (omit only in menu) required")
    async with _action_lock:
        try:
            inventory = await read_save_inventory()
            if inventory.get("status") != "ready":
                return inventory
            return await run_load_game_script({"inventory_id": inventory["inventoryId"], "save_token": save_token,
                "confirm_discard_unsaved_progress": True, "expected_turn": expected_turn})
        except Exception as exc:
            return {"status": "unknown", "loadCompleted": False, "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Load may already be underway; inspect loading state and never retry automatically"}


async def select_transition_civilization(
    civilization: StrictStr, selection_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Change only the pending next-Age civilization; never finalize the transition."""
    if (not isinstance(civilization, str) or not civilization.strip() or len(civilization) > 512
            or not isinstance(selection_token, str) or not selection_token or len(selection_token) > 250000
            or type(expected_turn) is not int or not 0 <= expected_turn <= 2**53 - 1):
        raise ValueError("Exact civilization ID, fresh selection token and expected turn required")
    return await _execute_and_verify("select_transition_civilization.js", {
        "civilization": civilization, "selection_token": selection_token, "expected_turn": expected_turn,
    }, "transition_civilization_state.js")


def _transition_arguments(workflow_token: str, expected_turn: int) -> dict[str, Any]:
    if (not isinstance(workflow_token, str) or not workflow_token or len(workflow_token) > 250000
            or type(expected_turn) is not int or not 0 <= expected_turn <= 2**53 - 1):
        raise ValueError("Fresh exact workflow token and expected turn required")
    return {"workflow_token": workflow_token, "expected_turn": expected_turn}


async def open_transition(workflow_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Activate only the pending civilization notification and verify the chooser opens."""
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "open",
    }, "transition_workflow_state.js")


async def view_transition_map(workflow_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Use the exact native View Map control without confirming any choices."""
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "view_map",
    }, "transition_workflow_state.js")


async def select_transition_memento(
    slot: StrictStr, memento: StrictStr, workflow_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Set one transition-only Memento; no implicit swap, toggle or profile mutation."""
    if (not isinstance(slot, str) or not slot.startswith("AgeTransitionPlayerMemento") or len(slot) > 512
            or not isinstance(memento, str) or not memento.strip() or len(memento) > 512):
        raise ValueError("Exact transition slot and Memento ID (or NONE) required")
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "memento", "slot": slot, "memento": memento,
    }, "transition_workflow_state.js")


async def apply_dedication_effect(
    effect_id: StrictStr, workflow_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Apply one pending non-placement effect, verifying its native remaining amount."""
    if not isinstance(effect_id, str) or not effect_id.strip() or len(effect_id) > 512:
        raise ValueError("Exact pending effect ID required")
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "effect", "effect_id": effect_id,
    }, "transition_workflow_state.js")


async def select_transition_capital(
    city_id: StrictInt, workflow_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Select one native owned candidate without swapping settlement names."""
    if type(city_id) is not int or not 0 <= city_id <= 2**53 - 1:
        raise ValueError("Exact owned capital candidate ID required")
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "capital", "city_id": city_id,
    }, "transition_workflow_state.js")


async def place_dedication_effect(
    effect_id: StrictStr, x: StrictInt, y: StrictInt, workflow_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Place one selected settlement effect on an exact revealed native-legal plot."""
    if (not isinstance(effect_id, str) or not effect_id.strip() or len(effect_id) > 512
            or any(type(value) is not int or not 0 <= value <= 2**53 - 1 for value in (x, y))):
        raise ValueError("Exact pending placement effect ID and nonnegative revealed coordinates required")
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "place_effect", "effect_id": effect_id, "x": x, "y": y,
    }, "transition_workflow_state.js")


async def complete_dedications(
    workflow_token: StrictStr, expected_turn: StrictInt, confirm: StrictBool, accept_unused_points: StrictBool,
) -> dict[str, Any]:
    """Close the resolved current transition deck, never force-complete pending effects."""
    if confirm is not True or type(accept_unused_points) is not bool:
        raise ValueError("Explicit deck confirmation and unused-point acknowledgement required")
    return await _execute_and_verify("transition_workflow_action.js", {
        **_transition_arguments(workflow_token, expected_turn), "operation": "complete_deck",
        "confirm": confirm, "accept_unused_points": accept_unused_points,
    }, "transition_workflow_state.js")


async def confirm_transition_choices(
    workflow_token: StrictStr, expected_turn: StrictInt, confirm: StrictBool,
) -> dict[str, Any]:
    """Confirm the exact current civilization/Memento choices, not necessarily completed loading."""
    if confirm is not True:
        raise ValueError("Explicit transition-choice confirmation required")
    return await _observe_transition_action("confirm_choices", {
        **_transition_arguments(workflow_token, expected_turn), "confirm": confirm,
    })


async def advance_age_transition(
    workflow_token: StrictStr, expected_turn: StrictInt, confirm: StrictBool,
) -> dict[str, Any]:
    """Advance only an unblocked native Age boundary; never an ordinary next turn."""
    if confirm is not True:
        raise ValueError("Explicit irreversible Age-boundary confirmation required")
    return await _observe_transition_action("advance", {
        **_transition_arguments(workflow_token, expected_turn), "confirm": confirm,
    })


async def begin_transition_age(loading_token: StrictStr) -> dict[str, Any]:
    """Acknowledge only the ready new-Age Continue screen, not arbitrary game loading."""
    if not isinstance(loading_token, str) or not loading_token or len(loading_token) > 250000:
        raise ValueError("Exact current transition loading token required")
    return await _observe_transition_action("begin", {"loading_token": loading_token})


async def _observe_transition_action(operation: str, arguments: dict[str, Any]) -> dict[str, Any]:
    # Unlike ordinary actions these may legitimately replace the entire turn/Age/UI context.
    # Submit once under the shared lock, then use only the fixed read-only loading observer.
    async with _action_lock:
        result: dict[str, Any] = {"status": "unknown", "transitionCompleted": False}
        after = None
        try:
            args = {**arguments, "operation": operation}
            result = (await run_transition_loading_script(args) if operation == "begin"
                      else await run_script("transition_workflow_action.js", args))
            if result.get("status") in {"rejected", "already_active"}:
                return result
            if result.get("status") != "submitted":
                raise ValueError("Unexpected transition submission response")
            before = result["before"]
            if any(type(before.get(key)) is not int for key in ("turn", "age", "playerId", "previousAgeCount")):
                raise ValueError("Missing transition origin context")
            async with asyncio.timeout(_TRANSITION_TIMEOUT):
                while True:
                    after = await run_transition_loading_script({"operation": "observe"})
                    same_player = type(after.get("playerId")) is int and after["playerId"] == before["playerId"]
                    same_origin = same_player and all(type(after.get(key)) is int and after[key] == before[key]
                                                     for key in ("turn", "age", "previousAgeCount"))
                    arrived = (same_player and after.get("phase") in {"started", "awaiting_begin"}
                               and type(after.get("turn")) is int and after["turn"] >= 0
                               and type(after.get("age")) is int and after["age"] != before["age"]
                               and after.get("ageType") == before.get("nextAge")
                               and after.get("civilization") == before.get("nextCivilization", before.get("civilization"))
                               and type(after.get("previousAgeCount")) is int
                               and after["previousAgeCount"] == before["previousAgeCount"] + 1)
                    choices_confirmed = (operation == "confirm_choices" and same_origin and after.get("phase") == "started"
                                         and after.get("ageType") == before.get("ageType") and after.get("choicePending") is False)
                    chooser_ready = (operation == "advance" and same_player and after.get("phase") == "started"
                                     and type(after.get("turn")) is int and before["turn"] <= after["turn"] <= before["turn"] + 1
                                     and after.get("age") == before["age"] and after.get("ageType") == before.get("ageType")
                                     and after.get("previousAgeCount") == before["previousAgeCount"]
                                     and after.get("choicePending") is True)
                    begun = (operation == "begin" and same_origin and after.get("phase") == "started"
                             and after.get("ageType") == before.get("ageType")
                             and after.get("civilization") == before.get("civilization"))
                    if arrived or choices_confirmed or chooser_ready or begun:
                        return {**result, "status": "verified_applied", "after": after,
                                "transitionCompleted": after.get("transitionCompleted") is True if arrived or begun else False,
                                "requiresBegin": after.get("phase") == "awaiting_begin"}
                    if after.get("phase") not in {"loading", "unavailable"} and not same_origin:
                        raise ValueError("Unexpected game/Age/civilization/progression context; do not retry")
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            return {**result, "status": "unknown", "transitionCompleted": False, "after": after,
                    "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Transition may already be underway/applied; refresh workflow/loading state, never retry automatically"}


async def edit_dedication(
    card_id: StrictStr, operation: Literal["add", "remove"], deck_token: StrictStr,
    max_legacy_point_cost: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Edit one card in an open current deck; never apply effects or finalize it."""
    if (not isinstance(card_id, str) or not card_id.strip() or len(card_id) > 512
            or operation not in ("add", "remove") or not isinstance(deck_token, str)
            or not deck_token or len(deck_token) > 250000
            or any(type(value) is not int or value < 0 or value > 2**53 - 1
                   for value in (max_legacy_point_cost, expected_turn))):
        raise ValueError("Exact card ID, add/remove, fresh deck token, legacy-point cap and turn required")
    return await _execute_and_verify("edit_dedication.js", {
        "card_id": card_id, "operation": operation, "deck_token": deck_token,
        "max_legacy_point_cost": max_legacy_point_cost, "expected_turn": expected_turn,
    }, "dedication_state.js")


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


async def start_hostile_diplomatic_project(target_player_id: StrictInt, action: StrictStr, max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Start one fixed offered sanction/espionage project; never declare war or select secondary targets."""
    return await _start_project("hostile", target_player_id, action, max_influence_cost, expected_turn)


async def declare_war(target_player_id: StrictInt, war_type: Literal["surprise", "formal"], expected_turn: StrictInt) -> dict[str, Any]:
    """Explicit native declaration against an exact met major; native diplomatic cascades may follow."""
    if any(type(v) is not int or v<0 for v in (target_player_id,expected_turn)) or war_type not in ("surprise","formal"):
        raise ValueError("Exact target, supported war type and expected turn required")
    return await _execute_and_verify("declare_war.js",{"target_player_id":target_player_id,"war_type":war_type,"expected_turn":expected_turn},"war_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def _start_project(
    kind: Literal["major", "city-state", "independent", "hostile"], target_player_id: int, action: str,
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


async def befriend_independent(target_player_id: StrictInt, max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Start one exact known independent-power befriending project under a native Influence cap."""
    return await _start_project("independent", target_player_id, "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN", max_influence_cost, expected_turn)


async def choose_syncretism(
    kind: Literal["units", "infrastructure", "self"], choice_id: StrictInt, expected_turn: StrictInt,
    confirm_unit_replacements: StrictBool = False,
) -> dict[str, Any]:
    """Commit one exact offered Syncretism choice; unit replacement needs explicit acknowledgement."""
    if (kind not in ("units", "infrastructure", "self") or type(choice_id) is not int or choice_id == -1
            or not -(2**31) <= choice_id < 2**31 or type(expected_turn) is not int or expected_turn < 0
            or type(confirm_unit_replacements) is not bool):
        raise ValueError("Exact Syncretism family, signed native choice ID, expected turn and boolean replacement acknowledgement required")
    return await _execute_and_verify("choose_syncretism.js", {
        "kind": kind, "choice_id": choice_id, "expected_turn": expected_turn,
        "confirm_unit_replacements": confirm_unit_replacements,
    }, "syncretism_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def choose_city_state_bonus(city_state_id: StrictInt, bonus: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Choose one exact native-eligible pending city-state bonus under local suzerainty."""
    if any(type(v) is not int or v < 0 for v in (city_state_id, expected_turn)) or not isinstance(bonus, str) or not bonus:
        raise ValueError("Exact city-state, bonus definition and expected turn are required")
    return await _execute_and_verify("choose_city_state_bonus.js", {"city_state_id": city_state_id, "bonus": bonus, "expected_turn": expected_turn}, "city_state_bonus_state.js")


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


async def activate_commander_great_person(unit_id: StrictInt, commander_id: StrictInt, expected_turn: StrictInt, effect: Literal["promotions", "heal", "combat_gold"] = "promotions") -> dict[str, Any]:
    """Activate exact Santa Anna, Morelos or Villa effect profile on a co-located Army Commander."""
    if any(type(v) is not int or v<0 for v in (unit_id,commander_id,expected_turn)) or unit_id==commander_id or effect not in ("promotions","heal","combat_gold"):
        raise ValueError("Distinct exact owned concrete Great Person/Army Commander IDs and expected turn required")
    return await _execute_and_verify("activate_commander_great_person.js",{"unit_id":unit_id,"commander_id":commander_id,"expected_turn":expected_turn,**({"effect":effect} if effect!="promotions" else {})},"commander_great_person_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def manage_alliance(target_player_id: StrictInt, action: Literal["form", "cancel"], expected_turn: StrictInt) -> dict[str, Any]:
    """Form a native zero-cost alliance or explicitly cancel one with zero definition penalties."""
    if any(type(v) is not int or v<0 for v in (target_player_id,expected_turn)) or action not in ("form","cancel"):
        raise ValueError("Exact known counterpart, form/cancel intent and expected turn required")
    return await _execute_and_verify("alliance_action.js",{"target_player_id":target_player_id,"action":action,"expected_turn":expected_turn},"alliance_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def support_befriending(event_id: StrictInt, target_player_id: StrictInt, max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Buy one capped native support token for an exact own ongoing befriending project."""
    if any(type(v) is not int or v < 0 for v in (event_id, target_player_id, expected_turn)) or type(max_influence_cost) not in (int, float) or not math.isfinite(max_influence_cost) or max_influence_cost < 0:
        raise ValueError("Exact own befriending event/target, finite Influence cap and expected turn required")
    return await _execute_and_verify("support_befriending.js", {
        "event_id": event_id, "target_player_id": target_player_id,
        "max_influence_cost": max_influence_cost, "expected_turn": expected_turn,
    }, "befriending_support_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def support_own_war(event_id: StrictInt, target_player_id: StrictInt, max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Add exactly one native runtime-priced support token to own side of an exact ongoing war."""
    if any(type(v) is not int or v<0 for v in (event_id,target_player_id,expected_turn)) or type(max_influence_cost) not in (int,float) or not math.isfinite(max_influence_cost) or max_influence_cost<0:
        raise ValueError("Exact own-war event/counterpart, finite Influence cap and expected turn required")
    return await _execute_and_verify("support_war.js",{"event_id":event_id,"target_player_id":target_player_id,"max_influence_cost":max_influence_cost,"expected_turn":expected_turn},"war_support_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def airdrop_infantry_group(unit_ids: list[StrictInt], commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Drop one exact complete2–7 Infantry payload into an entirely safe native landing footprint."""
    if not isinstance(unit_ids,list) or not 2<=len(unit_ids)<=7 or any(type(v) is not int or v<0 for v in unit_ids) or len(set(unit_ids))!=len(unit_ids) or any(type(v) is not int or v<0 for v in (commander_id,x,y,expected_turn)) or commander_id in unit_ids:
        raise ValueError("Exact2–7 distinct owned Infantry IDs, Squadron, landing target and expected turn required")
    ids=sorted(unit_ids)
    return await _execute_and_verify("unit_membership.js",{"mode":"airdrop_group","unit_id":ids[0],"payload_unit_ids":ids,"commander_id":commander_id,"x":x,"y":y,"expected_turn":expected_turn,"air_transport":True},"unit_membership_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def airdrop_infantry(unit_id: StrictInt, commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Drop exactly one Infantry from a promoted Squadron; captured stationed aircraft stay unchanged."""
    if any(type(v) is not int or v<0 for v in (unit_id,commander_id,x,y,expected_turn)) or unit_id==commander_id:
        raise ValueError("Distinct owned packed Infantry/Squadron IDs, exact landing and expected turn required")
    return await _execute_and_verify("unit_membership.js",{"mode":"airdrop","unit_id":unit_id,"commander_id":commander_id,"x":x,"y":y,"expected_turn":expected_turn,"air_transport":True},"unit_membership_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def join_airlift(unit_id: StrictInt, commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Pack exact nearby Infantry into an exact promoted Squadron through native membership."""
    if any(type(v) is not int or v<0 for v in (unit_id,commander_id,expected_turn)) or unit_id==commander_id:
        raise ValueError("Distinct owned Infantry/Squadron IDs and expected turn required")
    return await _execute_and_verify("unit_membership.js",{"mode":"join","unit_id":unit_id,"commander_id":commander_id,"expected_turn":expected_turn,"air_transport":True},"unit_membership_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def leave_airlift(unit_id: StrictInt, commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Individually deploy Infantry from a promoted Squadron at one native offered nearby land tile."""
    if any(type(v) is not int or v<0 for v in (unit_id,commander_id,x,y,expected_turn)) or unit_id==commander_id:
        raise ValueError("Distinct owned Infantry/Squadron IDs, exact deployment and expected turn required")
    return await _execute_and_verify("unit_membership.js",{"mode":"leave","unit_id":unit_id,"commander_id":commander_id,"x":x,"y":y,"expected_turn":expected_turn,"air_transport":True},"unit_membership_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def observed_army_attack(commander_id: StrictInt, kind: Literal["ranged", "melee"], target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """One existing fixed land focused attack with bounded multi-attacker effect observation."""
    if any(type(v) is not int or v<0 for v in (commander_id,target_player,target_unit_id,x,y,expected_turn)) or kind not in ("ranged","melee"):
        raise ValueError("Exact land commander, ranged/melee group kind, hostile field target and expected turn required")
    return await _execute_and_verify("army_attack.js",{"commander_id":commander_id,"attack_kind":kind,"target_player":target_player,"target_unit_id":target_unit_id,"x":x,"y":y,"expected_turn":expected_turn,"observe_effects":True,"observation_radius":1},"unit_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def fleet_attack(commander_id: StrictInt, role: Literal["heavy", "light"], target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """One native Heavy/Light focused naval command with captured deployed participants and observations."""
    if any(type(v) is not int or v<0 for v in (commander_id,target_player,target_unit_id,x,y,expected_turn)) or role not in ("heavy","light"):
        raise ValueError("Exact fleet commander, Heavy/Light role, visible hostile ship and expected turn required")
    return await _execute_and_verify("army_attack.js",{"commander_id":commander_id,"attack_kind":"sea_ranged" if role=="heavy" else "sea_melee","target_player":target_player,"target_unit_id":target_unit_id,"x":x,"y":y,"expected_turn":expected_turn,"observe_effects":True,"observation_radius":1},"unit_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def peace_city_action(target_player_id: StrictInt, city_owner: StrictInt, city_id: StrictInt, x: StrictInt, y: StrictInt, action: Literal["add", "remove", "propose", "accept", "reject"], deal_token: StrictStr, max_gold_cost: StrictFloat, max_influence_cost: StrictFloat, expected_turn: StrictInt, item_token: StrictStr | None = None, item_id: StrictInt | None = None) -> dict[str, Any]:
    """One explicitly identified visible city OFFER concession edit or peace negotiation step."""
    if (any(type(v) is not int or v<0 for v in (target_player_id,city_owner,city_id,x,y,expected_turn)) or action not in ("add","remove","propose","accept","reject") or not isinstance(deal_token,str) or not deal_token or len(deal_token)>100000 or
            any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in (max_gold_cost,max_influence_cost)) or
            (action=="add" and (not isinstance(item_token,str) or not item_token or len(item_token)>10000)) or (action=="remove" and (type(item_id) is not int or item_id<0)) or
            (action!="add" and item_token is not None) or (action!="remove" and item_id is not None)):
        raise ValueError("Exact visible city/counterpart, supported city-peace step/tokens and finite economic caps required")
    return await _execute_and_verify("peace_city_action.js",{"target_player_id":target_player_id,"city_owner":city_owner,"city_id":city_id,"x":x,"y":y,"action":action,"deal_token":deal_token,"max_gold_cost":max_gold_cost,"max_influence_cost":max_influence_cost,"expected_turn":expected_turn,"item_token":item_token,"item_id":item_id},"peace_city_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def observed_field_attack(unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, kind: Literal["melee", "ranged"], expected_turn: StrictInt, observation_radius: StrictInt = 1) -> dict[str, Any]:
    """One guarded field strike with bounded visible collateral observations and native kill attribution."""
    if any(type(v) is not int or v<0 for v in (unit_id,target_player,target_unit_id,x,y,expected_turn)) or kind not in ("melee","ranged") or type(observation_radius) is not int or not 1<=observation_radius<=3:
        raise ValueError("Exact field attacker/target, melee/ranged kind, radius1–3 and expected turn required")
    return await _execute_and_verify("attack_unit.js",{"unit_id":unit_id,"target_player":target_player,"target_unit_id":target_unit_id,"x":x,"y":y,"kind":kind,"expected_turn":expected_turn,"observe_effects":True,"observation_radius":observation_radius},"unit_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def withdraw_capped_project_support(event_id: StrictInt, target_player_id: StrictInt, max_cancel_penalty: StrictInt, max_unsupport_penalty: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Withdraw one own token under acknowledged native-definition penalty caps, preserving other support."""
    if any(type(v) is not int or v<0 for v in (event_id,target_player_id,max_cancel_penalty,max_unsupport_penalty,expected_turn)):
        raise ValueError("Exact own project/counterpart, native-definition penalty caps and expected turn required")
    return await _execute_and_verify("withdraw_project_support.js",{"event_id":event_id,"target_player_id":target_player_id,"expected_turn":expected_turn,"extended":True,"max_cancel_penalty":max_cancel_penalty,"max_unsupport_penalty":max_unsupport_penalty},"project_withdrawal_state.js")


async def found_adjacent_settlement(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Found at an explicit native-offered adjacent plot; source may be embarked."""
    if any(type(v) is not int or v<0 for v in (unit_id,x,y,expected_turn)):
        raise ValueError("Exact founder, adjacent destination and expected turn required")
    return await _execute_and_verify("local_civilian_action.js",{"kind":"found_adjacent","unit_id":unit_id,"x":x,"y":y,"expected_turn":expected_turn},"local_civilian_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def spread_foreign_religion(unit_id: StrictInt, target_player: StrictInt, target_city_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Spread only at the unit's exact visible met foreign centre; observe own charge/unit consumption."""
    if any(type(v) is not int or v<0 for v in (unit_id,target_player,target_city_id,expected_turn)):
        raise ValueError("Exact missionary, foreign centre owner/ID and expected turn required")
    return await _execute_and_verify("local_civilian_action.js",{"kind":"foreign_spread","unit_id":unit_id,"target_player":target_player,"target_city_id":target_city_id,"expected_turn":expected_turn},"local_civilian_state.js")


async def peace_concession(target_player_id: StrictInt, action: Literal["add", "remove", "propose", "accept", "reject"], deal_token: StrictStr, max_gold_cost: StrictFloat, max_influence_cost: StrictFloat, expected_turn: StrictInt, item_token: StrictStr | None = None, item_id: StrictInt | None = None) -> dict[str, Any]:
    """Edit/propose/respond to exact peace plus native-offered economic terms under gross currency caps."""
    if (any(type(v) is not int or v<0 for v in (target_player_id,expected_turn)) or action not in ("add","remove","propose","accept","reject") or not isinstance(deal_token,str) or not deal_token or len(deal_token)>100000 or
            any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in (max_gold_cost,max_influence_cost)) or
            (action=="add" and (not isinstance(item_token,str) or not item_token or len(item_token)>10000)) or (action=="remove" and (type(item_id) is not int or item_id<0)) or
            (action!="add" and item_token is not None) or (action!="remove" and item_id is not None)):
        raise ValueError("Exact counterpart/draft, supported economic peace step/item and finite gross spending caps required")
    return await _execute_and_verify("peace_concession.js",{"target_player_id":target_player_id,"action":action,"deal_token":deal_token,"max_gold_cost":max_gold_cost,"max_influence_cost":max_influence_cost,"expected_turn":expected_turn,"item_token":item_token,"item_id":item_id},"peace_concession_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def sweep_air_location(commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """One native Fighter Sweep at an exact visible own/unowned location; no invented enemy-unit target."""
    if type(observe_effects) is not bool or any(type(v) is not int or v<0 for v in (commander_id,x,y,expected_turn)):
        raise ValueError("Exact air commander, sweep location, boolean observation and expected turn required")
    return await _execute_and_verify("group_air_attack.js",{"commander_id":commander_id,"mission":"sweep","x":x,"y":y,"expected_turn":expected_turn,**({"observe_effects":True} if observe_effects else {})},"group_air_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def bombard_air_district(commander_id: StrictInt, target_player: StrictInt, district_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, target_token: StrictStr | None = None, observe_effects: StrictBool = False) -> dict[str, Any]:
    """One native Carpet Bomb mission against an exact visible empty enemy district."""
    if type(observe_effects) is not bool or any(type(v) is not int or v<0 for v in (commander_id,target_player,district_id,x,y,expected_turn)) or target_token is not None and (not isinstance(target_token,str) or not target_token or len(target_token)>100000):
        raise ValueError("Exact air commander, hostile district and expected turn required")
    return await _execute_and_verify("group_air_attack.js",{"commander_id":commander_id,"mission":"bomb","target_player":target_player,"district_id":district_id,"x":x,"y":y,"expected_turn":expected_turn,**({"target_token":target_token} if target_token is not None else {}),**({"observe_effects":True} if observe_effects else {})},"group_air_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def group_air_attack(commander_id: StrictInt, mission: Literal["land"], target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """One native grouped ground-attack mission from an exact packed squadron/carrier."""
    if type(observe_effects) is not bool or any(type(v) is not int or v<0 for v in (commander_id,target_player,target_unit_id,x,y,expected_turn)) or mission!="land":
        raise ValueError("Exact air commander, ground-attack mission, hostile field target and expected turn required")
    return await _execute_and_verify("group_air_attack.js",{"commander_id":commander_id,"mission":mission,"target_player":target_player,"target_unit_id":target_unit_id,"x":x,"y":y,"expected_turn":expected_turn,**({"observe_effects":True} if observe_effects else {})},"group_air_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def establish_air_base(commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Establish/move an exact squadron base to native-offered empty visible own/unowned land."""
    if any(type(v) is not int or v<0 for v in (commander_id,x,y,expected_turn)):
        raise ValueError("Exact squadron, destination and expected turn required")
    return await _execute_and_verify("commander_action.js",{"mode":"air_base","commander_id":commander_id,"x":x,"y":y,"expected_turn":expected_turn},"commander_action_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def withdraw_project_support(event_id: StrictInt, target_player_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Withdraw the sole local token from one exact supported zero-definition-penalty own project."""
    if any(type(v) is not int or v<0 for v in (event_id,target_player_id,expected_turn)):
        raise ValueError("Exact own project event/counterpart and expected turn required")
    return await _execute_and_verify("withdraw_project_support.js",{"event_id":event_id,"target_player_id":target_player_id,"expected_turn":expected_turn},"project_withdrawal_state.js")


async def start_targeted_diplomacy(target_player_id: StrictInt, action: Literal["send_gold", "hinder_food", "incite_raid", "sabotage_shipping", "ideological_revolt"], secondary_value: StrictInt, max_influence_cost: StrictFloat, expected_turn: StrictInt, max_gold_cost: StrictFloat = 0.0, secondary_owner: StrictInt | None = None, x: StrictInt | None = None, y: StrictInt | None = None) -> dict[str, Any]:
    """One fixed paired-secondary diplomatic action with visible qualified city/player or capped aid amount."""
    city_action=action in ("hinder_food","sabotage_shipping","ideological_revolt")
    if (any(type(v) is not int or v<0 for v in (target_player_id,secondary_value,expected_turn)) or action not in ("send_gold","hinder_food","incite_raid","sabotage_shipping","ideological_revolt") or
            any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in (max_influence_cost,max_gold_cost)) or
            (city_action and (secondary_owner!=target_player_id or any(type(v) is not int or v<0 for v in (secondary_owner,x,y)))) or
            (not city_action and any(v is not None for v in (secondary_owner,x,y)))):
        raise ValueError("Supported action, exact secondary identity/visible city coordinates, finite caps and expected turn required")
    native={"send_gold":"DIPLOMACY_ACTION_SEND_GOLD","hinder_food":"DIPLOMACY_ACTION_SABOTAGE_FOOD_PRODUCTION","incite_raid":"DIPLOMACY_ACTION_INCITE_RAID","sabotage_shipping":"DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SHIPPING","ideological_revolt":"DIPLOMACY_ACTION_ESPIONAGE_IDEOLOGICAL_REVOLT"}[action]
    args={"target_kind":"targeted-independent" if action=="incite_raid" else "targeted-major","target_player_id":target_player_id,"action":native,"secondary_value":secondary_value,"max_influence_cost":max_influence_cost,"expected_turn":expected_turn,"max_gold_cost":max_gold_cost,"secondary_owner":secondary_owner,"x":x,"y":y}
    return await _execute_and_verify("start_diplomatic_project.js",args,"diplomatic_aid_state.js" if action=="send_gold" else "diplomatic_project_state.js")


async def choose_extended_narrative(instance_id: StrictInt, instance_type: StrictInt, choice: StrictStr, expected_turn: StrictInt, max_cost: StrictFloat, cost_yield: Literal["YIELD_GOLD", "YIELD_DIPLOMACY"] | None = None, allow_trial: StrictBool = False) -> dict[str, Any]:
    """Choose an exact trial or paid narrative option only under explicit acknowledgement/native runtime cap."""
    if (any(type(v) is not int or v<0 for v in (instance_id,instance_type,expected_turn)) or not isinstance(choice,str) or not choice.strip() or type(max_cost) not in (int,float) or not math.isfinite(max_cost) or max_cost<0 or cost_yield not in (None,"YIELD_GOLD","YIELD_DIPLOMACY") or type(allow_trial) is not bool):
        raise ValueError("Exact narrative instance/choice, supported currency cap/trial acknowledgement and expected turn required")
    return await _execute_and_verify("choose_narrative.js",{"instance_id":instance_id,"instance_type":instance_type,"choice":choice.strip(),"expected_turn":expected_turn,"extended":True,"max_cost":max_cost,"cost_yield":cost_yield,"allow_trial":allow_trial},"narrative_state.js")


async def plunder_trade_route(unit_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Use installed current-tile trade plunder; native selects the eligible route, never a physical road."""
    if any(type(v) is not int or v<0 for v in (unit_id,expected_turn)):
        raise ValueError("Exact owned combat unit and expected turn required")
    return await _execute_and_verify("plunder_trade_route.js",{"unit_id":unit_id,"expected_turn":expected_turn},"trade_plunder_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def levy_city_state_unit(target_player_id: StrictInt, target_unit_id: StrictInt, unit_type: StrictStr, max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Levy one exact native-offered unit under an Influence cap with immediate receipt verification."""
    if (any(type(v) is not int or v<0 for v in (target_player_id,target_unit_id,expected_turn)) or not isinstance(unit_type,str) or not unit_type or type(max_influence_cost) not in (int,float) or not math.isfinite(max_influence_cost) or max_influence_cost<0):
        raise ValueError("Exact city-state, offered unit/type, finite Influence cap and expected turn required")
    return await _execute_and_verify("start_diplomatic_project.js",{"target_kind":"city-state","target_player_id":target_player_id,"target_unit_id":target_unit_id,"unit_type":unit_type,"action":"DIPLOMACY_ACTION_CS_LEVY_UNIT","max_influence_cost":max_influence_cost,"expected_turn":expected_turn},"city_state_levy_state.js")


async def peace_deal_action(target_player_id: StrictInt, action: Literal["prepare", "propose", "accept", "reject"], expected_turn: StrictInt, deal_token: StrictStr | None = None) -> dict[str, Any]:
    """One native white-peace draft/proposal/response step, never concessions or automatic acceptance."""
    if (any(type(v) is not int or v<0 for v in (target_player_id,expected_turn)) or action not in ("prepare","propose","accept","reject") or
            action!="prepare" and (not isinstance(deal_token,str) or not deal_token or len(deal_token)>100000)):
        raise ValueError("Exact target, supported white-peace action, fresh token for submission/response and expected turn required")
    return await _execute_and_verify("peace_deal_action.js",{"target_player_id":target_player_id,"action":action,"expected_turn":expected_turn,"deal_token":deal_token},"peace_deal_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def assault_city(unit_id: StrictInt, target_player: StrictInt, target_city_id: StrictInt, x: StrictInt, y: StrictInt, mode: Literal["melee", "occupy"], expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Explicit adjacent settlement assault/occupation, never an implicit field-action capture."""
    if type(observe_effects) is not bool or any(type(v) is not int or v<0 for v in (unit_id,target_player,target_city_id,x,y,expected_turn)) or mode not in ("melee","occupy"):
        raise ValueError("Exact attacker, enemy city/centre, melee/occupy mode and expected turn required")
    return await _execute_and_verify("assault_city.js",{"unit_id":unit_id,"target_player":target_player,"target_city_id":target_city_id,"x":x,"y":y,"mode":mode,"expected_turn":expected_turn,**({"observe_effects":True} if observe_effects else {})},"city_assault_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def resolve_city_capture(city_id: StrictInt, choice: Literal["keep", "raze"], expected_turn: StrictInt) -> dict[str, Any]:
    """Resolve one exact currently pending owned capture decision; raze start is not completed destruction."""
    if any(type(v) is not int or v<0 for v in (city_id,expected_turn)) or choice not in ("keep","raze"):
        raise ValueError("Exact pending capture city, keep/raze and expected turn required")
    return await _execute_and_verify("resolve_city_capture.js",{"city_id":city_id,"choice":choice,"expected_turn":expected_turn},"city_capture_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def clear_factory_resources(settlement: StrictStr, resource: StrictStr, target_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Explicit native bulk release of one city's current factory specialization, not atomic reassignment."""
    if (not isinstance(settlement,str) or not settlement.strip() or not isinstance(resource,str) or not resource or not isinstance(target_token,str) or not target_token or len(target_token)>100000 or type(expected_turn) is not int or expected_turn<0):
        raise ValueError("Exact city, factory resource, fresh selection token and expected turn required")
    return await _execute_and_verify("clear_factory_resources.js",{"settlement":settlement.strip(),"resource":resource,"target_token":target_token,"expected_turn":expected_turn},"factory_resource_state.js")


async def cross_commander_shore(commander_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Cross one exact noncombat shore/river-endpoint edge, retaining the captured packed army."""
    if any(type(v) is not int or v<0 for v in (commander_id,x,y,expected_turn)):
        raise ValueError("Exact land commander, adjacent shore/river tile and expected turn required")
    return await _execute_and_verify("commander_action.js",{"commander_id":commander_id,"x":x,"y":y,"expected_turn":expected_turn,"mode":"shore"},"commander_action_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def air_attack_from_commander(unit_id: StrictInt, source_commander_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Strike one exact visible field target with aircraft from a captured Aerodrome/squadron/carrier."""
    if type(observe_effects) is not bool or any(type(v) is not int or v<0 for v in (unit_id,source_commander_id,target_player,target_unit_id,x,y,expected_turn)) or unit_id==source_commander_id:
        raise ValueError("Exact aircraft, captured source commander, hostile field target and expected turn required")
    return await _execute_and_verify("air_attack_unit.js",{"unit_id":unit_id,"source_commander_id":source_commander_id,"target_player":target_player,"target_unit_id":target_unit_id,"x":x,"y":y,"expected_turn":expected_turn,**({"observe_effects":True} if observe_effects else {})},"air_attack_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def transfer_aircraft(unit_id: StrictInt, target_commander_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Rebase one aircraft into an exact unique owned Aerodrome, squadron or carrier."""
    if any(type(v) is not int or v<0 for v in (unit_id,target_commander_id,expected_turn)) or unit_id==target_commander_id:
        raise ValueError("Distinct owned aircraft/air-commander IDs and expected turn required")
    return await _execute_and_verify("rebase_unit.js",{"unit_id":unit_id,"target_commander_id":target_commander_id,"expected_turn":expected_turn},"unit_rebase_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def archive_great_work(great_work_index: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Archive one exact owned displayed Great Work while preserving the full owned work ledger."""
    if any(type(v) is not int or v<0 for v in (great_work_index,expected_turn)):
        raise ValueError("Exact owned work index and expected turn required")
    return await _execute_and_verify("archive_great_work.js",{"great_work_index":great_work_index,"expected_turn":expected_turn},"great_work_location_state.js")


async def connect_merchant_road(unit_id: StrictInt, target_city_id: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Create an exact native-offered new owned-city road connection without movement fallback."""
    if any(type(v) is not int or v<0 for v in (unit_id,target_city_id,expected_turn)):
        raise ValueError("Exact Merchant, target city and expected turn required")
    return await _execute_and_verify("connect_merchant_road.js",{"unit_id":unit_id,"target_city_id":target_city_id,"expected_turn":expected_turn},
        "merchant_road_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def resettle_migrant(unit_id: StrictInt, x: StrictInt, y: StrictInt, improvement: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Consume one exact Migrant into an explicitly chosen native expansion tile/improvement."""
    if any(type(v) is not int or v<0 for v in (unit_id,x,y,expected_turn)) or not isinstance(improvement,str) or not improvement:
        raise ValueError("Exact Migrant, expansion tile/improvement and expected turn required")
    return await _execute_and_verify("resettle_migrant.js",{"unit_id":unit_id,"x":x,"y":y,"improvement":improvement,"expected_turn":expected_turn},
        "population_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def local_civilian_action(unit_id: StrictInt, kind: Literal["found", "excavate", "research", "spread", "great_person", "resettle", "treat_sick"], expected_turn: StrictInt, ability: StrictStr | None = None) -> dict[str, Any]:
    """Perform one fixed native civilian activity only at its proven current own/unowned location."""
    if (any(type(v) is not int or v < 0 for v in (unit_id, expected_turn)) or kind not in ("found", "excavate", "research", "spread", "great_person", "resettle", "treat_sick") or
            ability is not None and (not isinstance(ability,str) or not ability)):
        raise ValueError("Exact owned unit, supported local activity/ability and expected turn are required")
    return await _execute_and_verify("local_civilian_action.js", {"unit_id":unit_id,"kind":kind,"expected_turn":expected_turn,"ability":ability},
        "local_civilian_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def choose_religious_action(
    kind: Literal["pantheon", "belief", "found"], choice: StrictStr, expected_turn: StrictInt,
    custom_name: StrictStr | None = None,
) -> dict[str, Any]:
    """Select an exact pantheon/belief or found an unclaimed religion, optionally with a custom name."""
    if kind not in ("pantheon", "belief", "found") or not isinstance(choice, str) or not choice or type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("Supported religious action, exact definition ID and expected turn are required")
    arguments = {"kind": kind, "choice": choice, "expected_turn": expected_turn}
    if custom_name is not None:
        # Native picker: max-length=16 (UTF-16 units), no |<>[] markup. Also reject control/invalid text.
        if (kind != "found" or not isinstance(custom_name, str) or not custom_name.strip()
                or sum(2 if ord(c) > 0xffff else 1 for c in custom_name) > 16
                or any(c in "|<>[]\u2028\u2029" or ord(c) < 32 or 0x7f <= ord(c) <= 0x9f
                       or 0xd800 <= ord(c) <= 0xdfff for c in custom_name)):
            raise ValueError("Custom names are founding-only, nonblank, at most 16 UTF-16 units and cannot contain markup or control characters")
        arguments["custom_name"] = custom_name
    return await _execute_and_verify("religious_choice.js", arguments, "religious_choice_state.js")


async def pay_call_to_arms(
    war_event_id: StrictInt, ally_player_id: StrictInt, opponent_player_id: StrictInt,
    payment_token: StrictStr, max_influence_cost: StrictInt | StrictFloat, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Pay only the exact pending call-to-arms quote; never join war or cancel an alliance."""
    if (any(type(value) is not int or value < 0 for value in (war_event_id, ally_player_id, opponent_player_id, expected_turn))
            or ally_player_id == opponent_player_id or not isinstance(payment_token, str) or not payment_token or len(payment_token) > 100000
            or type(max_influence_cost) not in (int, float) or not math.isfinite(max_influence_cost) or max_influence_cost < 0):
        raise ValueError("Exact pending war, ally/opponent, payment token, finite Influence cap and expected turn required")
    return await _execute_and_verify("pay_call_to_arms.js", {
        "war_event_id": war_event_id, "ally_player_id": ally_player_id, "opponent_player_id": opponent_player_id,
        "payment_token": payment_token, "max_influence_cost": max_influence_cost, "expected_turn": expected_turn,
    }, "call_to_arms_payment_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def append_advanced_construction(settlement: StrictStr, item: StrictStr, construction_intent: Literal["wonder", "repair", "overbuild", "improvement"], x: StrictInt, y: StrictInt, target_token: StrictStr, expected_turn: StrictInt, replace_improvement: StrictBool = False) -> dict[str, Any]:
    """Append one explicitly acknowledged advanced placement/repair, never purchase or complete it."""
    if (not isinstance(settlement, str) or not settlement.strip() or not isinstance(item, str) or not item or
            construction_intent not in ("wonder", "repair", "overbuild", "improvement") or any(type(v) is not int or v < 0 for v in (x, y, expected_turn)) or
            type(replace_improvement) is not bool or (replace_improvement and construction_intent not in ("wonder", "overbuild", "improvement")) or
            not isinstance(target_token, str) or not target_token or len(target_token) > 100000):
        raise ValueError("Exact city, constructible/intent, tile token and expected turn are required")
    return await _execute_and_verify("advanced_construction.js", {
        "settlement": settlement.strip(), "item": item, "construction_intent": construction_intent, "x": x, "y": y, "target_token": target_token, "expected_turn": expected_turn, "replace_improvement": replace_improvement,
    }, "city_construction_state.js")


async def purchase_repair(
    settlement: StrictStr, item: StrictStr, x: StrictInt, y: StrictInt, target_token: StrictStr,
    max_gold_cost: StrictInt | StrictFloat, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Buy one exact damaged constructible's repair within a Gold cap; never retry submission."""
    if (not isinstance(settlement, str) or not settlement.strip() or not isinstance(item, str) or not item
            or any(type(v) is not int or v < 0 for v in (x, y, expected_turn))
            or not isinstance(target_token, str) or not target_token or len(target_token) > 100000
            or type(max_gold_cost) not in (int, float) or not math.isfinite(max_gold_cost) or max_gold_cost < 0):
        raise ValueError("Exact settlement, constructible, tile token, finite Gold cap and expected turn are required")
    return await _execute_and_verify("advanced_construction.js", {
        "mode": "purchase", "construction_intent": "repair", "settlement": settlement.strip(), "item": item,
        "x": x, "y": y, "target_token": target_token, "max_gold_cost": max_gold_cost, "expected_turn": expected_turn,
    }, "city_construction_state.js")


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
    """Use the native route chooser's direct establishment or Send Merchant branch once."""
    if any(type(value) is not int or value < 0 for value in (unit_id, target_player_id, target_city_id, expected_turn)):
        raise ValueError("Nonnegative owned Merchant, target player/city IDs and expected turn are required")
    arguments = {"unit_id": unit_id, "target_player_id": target_player_id,
                 "target_city_id": target_city_id, "expected_turn": expected_turn}
    result = await _execute_and_verify("establish_trade_route.js", arguments, "trade_route_state.js",
                                       verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)
    if result.get("status") != "verified_applied":
        return result
    after = result["after"]
    if after.get("newRouteObserved") is True:
        return {**result, "outcome": "route_established"}
    if result.get("submissionKind") == "send_merchant":
        if after.get("merchantMoveOrderObserved") is True:
            return {**result, "status": "submitted", "outcome": "merchant_move_order_observed", "queuedTargetVerified": False,
                    "reason": "MOVE_TO observed, but exact queued destination and future arrival are unverified. Route not established; do not resubmit automatically"}
        if after.get("merchantMovementObserved") is True:
            return {**result, "status": "verified_partial", "outcome": "merchant_moved_route_not_active",
                    "reason": "Merchant movement observed, not route establishment; inspect fresh state before further orders"}
        return {**result, "status": "unknown", "reason": "Dispatch evidence is unverified; never retry automatically"}
    return result


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


async def travel_unit(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, max_steps: StrictInt = 1, peaceful_player_id: StrictInt | None = None) -> dict[str, Any]:
    """One bounded current-turn ordinary-unit path, optionally through exact native-permitted peaceful territory."""
    if any(type(v) is not int or v<0 for v in (unit_id,x,y,expected_turn)) or type(max_steps) is not int or not 1<=max_steps<=8 or (peaceful_player_id is not None and (type(peaceful_player_id) is not int or peaceful_player_id<0)):
        raise ValueError("Exact owned unit/destination/turn, max_steps1–8 and optional exact peaceful counterpart required")
    return await _execute_and_verify("move_unit.js",{"unit_id":unit_id,"x":x,"y":y,"expected_turn":expected_turn,"mode":"travel","max_steps":max_steps,"peaceful_player_id":peaceful_player_id},"unit_position_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def move_unit(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Issue one native fog-capable move; distinguish observed arrival from queued intent."""
    if any(type(value) is not int or value < 0 for value in (unit_id, x, y, expected_turn)):
        raise ValueError("Nonnegative owned unit ID, tile coordinates and expected turn are required")
    arguments = {"unit_id": unit_id, "x": x, "y": y, "expected_turn": expected_turn, "mode": "normal"}
    async with _action_lock:
        result = {"status": "unknown", **arguments}
        after = None
        try:
            result = await run_script("move_unit.js", arguments)
            if result.get("status") in {"rejected", "already_active"}:
                return result
            if result.get("status") != "submitted":
                raise ValueError("Unexpected movement submission response")
            before = result["before"]
            if type(before.get("moveOperation")) is not int:
                raise ValueError("Unverified native move operation")
            async with asyncio.timeout(_COMBAT_VERIFICATION_TIMEOUT):
                while True:
                    after = await run_script("normal_move_state.js", {"unit_id": unit_id})
                    if any(type(before.get(key)) is not int or type(after.get(key)) is not int or before[key] != after[key]
                           for key in ("turn", "age", "playerId")) or after.get("present") is not True or after.get("isDead") is True or any(
                            before.get(key) != after.get(key) for key in ("unitId", "unitType", "componentType")):
                        return {**result, "status": "unknown", "after": after,
                                "reason": "Context or owned unit changed/unavailable; inspect state, never retry automatically"}
                    if after.get("location") == {"x": x, "y": y}:
                        return {**result, "status": "verified_applied", "outcome": "arrived", "after": after}
                    if after.get("queueSize", 0) and after.get("operation") == before.get("moveOperation"):
                        return {**result, "status": "submitted", "outcome": "move_order_observed", "after": after,
                                "queuedTargetVerified": False,
                                "reason": "A MOVE_TO is in progress/queued; exact queued destination and future arrival are not verified. Do not resubmit"}
                    if after.get("location") is not None and after["location"] != before.get("location"):
                        return {**result, "status": "verified_partial", "outcome": "moved_partway", "after": after,
                                "reason": "Movement observed, but destination not reached; inspect current state rather than retry automatically"}
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            return {**result, "status": "unknown", **({"after": after} if after is not None else {}),
                    "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Movement outcome is unknown; inspect current state and never retry automatically"}


async def rail_unit(unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Rail one unpacked ordinary land unit to an exact visible owned native-offered tile."""
    if any(type(v) is not int or v < 0 for v in (unit_id, x, y, expected_turn)):
        raise ValueError("An exact owned unit, destination and expected turn are required")
    return await _execute_and_verify("move_unit.js", {
        "unit_id": unit_id, "x": x, "y": y, "expected_turn": expected_turn, "mode": "rail",
    }, "unit_position_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def advance_unit(unit_id: StrictInt, target_player: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Advance one ordinary combat unit into an exact empty adjacent wartime enemy field."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, x, y, expected_turn)):
        raise ValueError("Exact owned unit, wartime enemy/tile and expected turn are required")
    return await _execute_and_verify("move_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "x": x, "y": y, "expected_turn": expected_turn, "mode": "advance",
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
    unit_id: StrictInt, order: Literal["skip", "sleep", "wake", "fortify", "heal", "alert", "cancel", "auto_explore"], expected_turn: StrictInt,
) -> dict[str, Any]:
    """Issue a fixed native order; explicit Scout auto-explore may replace its old order."""
    if any(type(v) is not int or v < 0 for v in (unit_id, expected_turn)) or not isinstance(order, str) or order not in {
        "skip", "sleep", "wake", "fortify", "heal", "alert", "cancel", "auto_explore",
    }:
        raise ValueError("An owned unit, supported non-target order and expected turn are required")
    return await _execute_and_verify("unit_order.js", {"unit_id": unit_id, "order": order, "expected_turn": expected_turn},
                                     "unit_order_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT if order == "auto_explore" else None)


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
                    if after["turn"] == expected_turn and after.get("active") is True and after.get("sent") is False:
                        unit = after.get("firstReadyUnit") if after.get("firstReadyUnitStatus") == "identified" else None
                        needs_order = after.get("remainingMovesBlocker") is True
                        if after.get("hasBlocker") is True or needs_order:
                            if after.get("hasBlocker") is True:
                                reason = f"Turn did not advance: native end-turn blocker {after.get('blockerName') or after.get('blocker')} remains."
                            else:
                                reason = "Turn did not advance: a unit needs an explicit order."
                            if unit is not None:
                                reason += f" First ready unit: {unit.get('name') or unit.get('id') or 'Unit'} #{unit['instanceId']}"
                                location = unit.get("location")
                                if location is not None:
                                    reason += f" at ({location['x']}, {location['y']})"
                                if unit.get("movesRemaining") is not None:
                                    reason += f", {unit['movesRemaining']} movement remaining"
                                reason += "."
                            return {**result, "status": "blocked", "after": after,
                                    "reason": reason + " Inspect current state and resolve pending tasks before requesting end-turn again."}
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


async def acknowledge_espionage_report(
    notification_id: StrictInt, component_type: StrictInt, report_token: StrictStr, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Activate one exact informational report, then its native Continue button; never navigate diplomacy."""
    if (any(type(value) is not int or value < 0 for value in (notification_id, component_type, expected_turn))
            or not isinstance(report_token, str) or not report_token or len(report_token) > 100000):
        raise ValueError("Exact local espionage report component, token and expected turn required")
    async with _action_lock:
        result = {"status": "unknown"}
        after = None
        continued = False
        try:
            result = await run_script("acknowledge_espionage_report.js", {
                "notification_id": notification_id, "component_type": component_type,
                "report_token": report_token, "expected_turn": expected_turn, "phase": "open",
            })
            if result.get("status") in {"rejected", "already_active"}:
                return result
            if result.get("status") != "submitted":
                raise ValueError("Unexpected report activation response")
            before = result.get("before", {})
            if before.get("turn") != expected_turn or any(type(before.get(key)) is not int for key in ("turn", "age", "playerId")):
                raise ValueError("Unverified report activation context")
            async with asyncio.timeout(_COMBAT_VERIFICATION_TIMEOUT):
                while True:
                    after = await run_script("espionage_report_state.js", {"before": before})
                    if (any(type(after.get(key)) is not int or after[key] != before[key] for key in ("turn", "age", "playerId"))
                            or after.get("identityUnchanged") is not True or after.get("balancesUnchanged") is not True
                            or after.get("uiStatus") not in {"closed", "matching"}):
                        raise ValueError("Report, UI, currency balances or game context changed")
                    if not continued and after["uiStatus"] == "matching":
                        continued = True
                        continuation = await run_script("acknowledge_espionage_report.js", {"phase": "continue", "before": before})
                        if continuation.get("status") != "submitted":
                            raise ValueError("Native report Continue was rejected or unverified")
                    elif continued and after.get("acknowledged") is True and after.get("popupClosed") is True:
                        return {**result, "status": "verified_applied", "after": after}
                    await asyncio.sleep(_VERIFICATION_INTERVAL)
        except Exception as exc:
            return {**result, "status": "unknown", **({"after": after} if after is not None else {}),
                    "phase": "continue" if continued else "open", "error": f"{type(exc).__name__}: {exc}",
                    "reason": "Report acknowledgement is unverified; the popup may remain open. Inspect current state; never retry automatically"}


async def close_triumph_popup(popup_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Press native Close once on the exact currently visible Triumph completion popup."""
    if not isinstance(popup_token, str) or not popup_token or len(popup_token) > 100000 or type(expected_turn) is not int or expected_turn < 0:
        raise ValueError("Fresh exact Triumph popup token and expected turn required")
    return await _execute_and_verify("close_triumph_popup.js", {
        "popup_token": popup_token, "expected_turn": expected_turn, "request_id": uuid4().hex,
    }, "triumph_popup_state.js")


async def acknowledge_town_focus(
    notification_id: StrictInt, component_type: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Acknowledge one owned Town-focus reminder without changing its current focus."""
    if any(type(v) is not int or v < 0 for v in (notification_id, component_type, expected_turn)):
        raise ValueError("Exact local Town reminder component and expected turn required")
    return await _execute_and_verify("acknowledge_town_focus.js", {
        "notification_id": notification_id, "component_type": component_type, "expected_turn": expected_turn,
    }, "town_focus_reminder_state.js")


async def acknowledge_advisor_warning(
    notification_id: StrictInt, component_type: StrictInt, expected_turn: StrictInt,
) -> dict[str, Any]:
    """Acknowledge one exact local advisor warning using the native viewed operation."""
    if any(type(value) is not int or value < 0 for value in (notification_id, component_type, expected_turn)):
        raise ValueError("Exact local advisor notification ID, component type and expected turn are required")
    return await _execute_and_verify("acknowledge_advisor_warning.js", {
        "notification_id": notification_id, "component_type": component_type, "expected_turn": expected_turn,
    }, "advisor_warning_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


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


async def respond_first_meet(target_player_id: StrictInt, greeting: Literal["friendly", "neutral", "unfriendly"], max_influence_cost: StrictFloat, notification_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Respond once to one native pending PLAYER_MET greeting, never permission-only or session guessing."""
    if any(type(v) is not int or v<0 for v in (target_player_id,expected_turn)) or greeting not in ("friendly","neutral","unfriendly") or type(max_influence_cost) not in (int,float) or not math.isfinite(max_influence_cost) or max_influence_cost<0 or not isinstance(notification_token,str) or not notification_token or len(notification_token)>100000:
        raise ValueError("Exact pending first-meet target/token, fixed greeting, finite Influence cap and expected turn required")
    return await _execute_and_verify("respond_first_meet.js",{"target_player_id":target_player_id,"greeting":greeting,"max_influence_cost":max_influence_cost,"notification_token":notification_token,"expected_turn":expected_turn},"first_meet_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def respond_hostile_diplomatic_project(action_id: StrictInt, response: Literal["accept", "support", "reject"], max_influence_cost: StrictFloat, expected_turn: StrictInt) -> dict[str, Any]:
    """Respond to one exact revealed incoming sanction; never infer a pending choice from native permission alone."""
    if any(type(v) is not int or v<0 for v in (action_id,expected_turn)) or response not in ("accept","support","reject") or type(max_influence_cost) not in (int,float) or not math.isfinite(max_influence_cost) or max_influence_cost<0:
        raise ValueError("Exact incoming sanction event, response, finite Influence cap and expected turn required")
    return await _execute_and_verify("respond_diplomatic_project.js",{"action_id":action_id,"response":response,"max_influence_cost":max_influence_cost,"expected_turn":expected_turn,"hostile":True},"diplomatic_response_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


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
        "observe_effects": True, "observation_radius": 1,
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def naval_attack_land_unit(unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Fixed native naval fire on an exact enemy-owned coastal land field defender."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact naval attacker, wartime field defender/tile and expected turn are required")
    return await _execute_and_verify("attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id, "x": x, "y": y,
        "expected_turn": expected_turn, "kind": "shore", "target_territory": "enemy_field",
        "observe_effects": True, "observation_radius": 1,
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def melee_attack_enemy_field(unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt) -> dict[str, Any]:
    """Adjacent melee against an exact enemy-owned non-centre/non-district field defender."""
    if any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact attacker, wartime field defender/tile and expected turn are required")
    return await _execute_and_verify("attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id, "x": x, "y": y,
        "expected_turn": expected_turn, "kind": "melee", "target_territory": "enemy_field",
        "observe_effects": True, "observation_radius": 1,
    }, "unit_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def bombard_shore_district(unit_id: StrictInt, target_player: StrictInt, district_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Ranged naval attack from water against an exact visible hostile land district."""
    if type(observe_effects) is not bool or any(type(v) is not int or v < 0 for v in (unit_id, target_player, district_id, x, y, expected_turn)):
        raise ValueError("Exact naval attacker, wartime land district/tile and expected turn are required")
    return await _execute_and_verify("ranged_district_attack.js", {
        "unit_id": unit_id, "target_player": target_player, "district_id": district_id, "x": x, "y": y, "expected_turn": expected_turn, "domain": "DOMAIN_SEA",**({"observe_effects":True} if observe_effects else {}),
    }, "district_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def air_attack_unit(unit_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Strike one exact visible field combat target from a captured owned city Aerodrome."""
    if type(observe_effects) is not bool or any(type(v) is not int or v < 0 for v in (unit_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact aircraft, hostile target identity/tile and expected turn are required")
    return await _execute_and_verify("air_attack_unit.js", {
        "unit_id": unit_id, "target_player": target_player, "target_unit_id": target_unit_id, "x": x, "y": y, "expected_turn": expected_turn,**({"observe_effects":True} if observe_effects else {}),
    }, "air_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def pillage_route(unit_id: StrictInt, target_player: StrictInt, x: StrictInt, y: StrictInt, target_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Pillage an exact fresh visible enemy route under the current land combat unit."""
    if any(type(v) is not int or v<0 for v in (unit_id,target_player,x,y,expected_turn)) or not isinstance(target_token,str) or not target_token or len(target_token)>100000:
        raise ValueError("Exact owned pillager, enemy route tile/token and expected turn required")
    return await _execute_and_verify("pillage_tile.js",{"unit_id":unit_id,"target_player":target_player,"x":x,"y":y,"target_token":target_token,"expected_turn":expected_turn,"kind":"route"},"pillage_state.js",verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def coastal_raid(unit_id: StrictInt, target_player: StrictInt, x: StrictInt, y: StrictInt, target_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Raid one adjacent empty enemy coastal land tile with the fixed native naval operation."""
    if (any(type(v) is not int or v < 0 for v in (unit_id, target_player, x, y, expected_turn)) or
            not isinstance(target_token, str) or not target_token or len(target_token) > 100000):
        raise ValueError("Exact naval unit, wartime coastal tile/token and expected turn are required")
    return await _execute_and_verify("pillage_tile.js", {
        "unit_id": unit_id, "target_player": target_player, "x": x, "y": y, "target_token": target_token, "expected_turn": expected_turn, "kind": "coastal",
    }, "pillage_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def pillage_tile(unit_id: StrictInt, target_player: StrictInt, x: StrictInt, y: StrictInt, target_token: StrictStr, expected_turn: StrictInt) -> dict[str, Any]:
    """Pillage constructibles on the exact occupied hostile non-centre tile with a fresh token."""
    if (any(type(v) is not int or v < 0 for v in (unit_id, target_player, x, y, expected_turn)) or
            not isinstance(target_token, str) or not target_token or len(target_token) > 100000):
        raise ValueError("Exact unit, wartime tile, constructible token and expected turn are required")
    return await _execute_and_verify("pillage_tile.js", {
        "unit_id": unit_id, "target_player": target_player, "x": x, "y": y, "target_token": target_token, "expected_turn": expected_turn,
    }, "pillage_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def bombard_district(unit_id: StrictInt, target_player: StrictInt, district_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Ranged-only attack on an exact visible hostile defensible district; never enters/captures."""
    if type(observe_effects) is not bool or any(type(v) is not int or v < 0 for v in (unit_id, target_player, district_id, x, y, expected_turn)):
        raise ValueError("Exact attacker, hostile district identity/tile and expected turn are required")
    return await _execute_and_verify("ranged_district_attack.js", {
        "unit_id": unit_id, "target_player": target_player, "district_id": district_id, "x": x, "y": y, "expected_turn": expected_turn,**({"observe_effects":True} if observe_effects else {}),
    }, "district_attack_state.js", verification_timeout=_COMBAT_VERIFICATION_TIMEOUT)


async def commander_attack(commander_id: StrictInt, target_player: StrictInt, target_unit_id: StrictInt, x: StrictInt, y: StrictInt, expected_turn: StrictInt, observe_effects: StrictBool = False) -> dict[str, Any]:
    """Use the fixed direct commander ability against one exact adjacent field target."""
    if type(observe_effects) is not bool or any(type(v) is not int or v < 0 for v in (commander_id, target_player, target_unit_id, x, y, expected_turn)):
        raise ValueError("Exact commander, hostile identity/tile and expected turn are required")
    return await _execute_and_verify("commander_attack.js", {
        "commander_id": commander_id, "target_player": target_player, "target_unit_id": target_unit_id, "x": x, "y": y, "expected_turn": expected_turn,**({"observe_effects":True} if observe_effects else {}),
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
        "observe_effects": True, "observation_radius": 1,
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
        "observe_effects": True, "observation_radius": 1,
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
