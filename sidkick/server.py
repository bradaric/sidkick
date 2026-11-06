"""On-demand MCP service for Sidkick game adapters."""

import argparse
from base64 import b64encode
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.types import Icon, ToolAnnotations

from civ7.actions import (
    attack_unit,
    acknowledge_agenda,
    append_city_production,
    assign_resource,
    assign_specialist,
    buy_attribute_node,
    choose_celebration,
    choose_government,
    choose_narrative,
    establish_trade_route,
    end_turn,
    move_great_work,
    move_unit,
    pack_commander,
    place_population,
    promote_unit,
    purchase_city_item,
    reinforce_unit,
    review_resources,
    review_policies,
    respond_diplomatic_project,
    select_civic,
    select_technology,
    set_policy_active,
    set_culture_card,
    set_town_focus,
    set_unit_order,
    start_city_state_project,
    start_diplomatic_project,
    upgrade_town,
    upgrade_unit,
    unpack_commander,
)
from civ7.player import snapshot
from civ7.queries import (
    age_transition,
    archaeology,
    available_decisions,
    building_placements,
    city_states,
    combat_options,
    diplomacy,
    empire,
    explored_map,
    growth,
    great_works,
    known_world,
    military_logistics,
    movement_and_founding,
    religion,
    research_and_government,
    resources_and_trade,
    settlements,
    turn_context,
    units,
    visible_threats,
    victory_progress,
)


ROOT = Path(__file__).resolve().parents[1]


def server_icon() -> Icon:
    data = b64encode((ROOT / "assets" / "sidkick-icon-256.png").read_bytes()).decode("ascii")
    return Icon(
        src=f"data:image/png;base64,{data}",
        mimeType="image/png",
        sizes=["256x256"],
    )


def create_server(*, enable_writes: bool = False) -> MCPServer:
    server = MCPServer(
        "Sidkick",
        title="Sidkick",
        description=("Live game data and opt-in typed gameplay actions." if enable_writes
                     else "Live, read-only game data for strategy advice."),
        icons=[server_icon()],
        instructions=(
            ("Local-player Civilization VII data with explicitly enabled typed gameplay actions. "
             "Only perform writes within the user's explicit action instructions or bounded delegated "
             "single-player sandbox authorization; never infer permission outside that scope. "
             "Never retry an unknown/cancelled action automatically; read current state first. "
             if enable_writes else "Read-only, local-player Civilization VII data for strategy advice. ")
            + "Use "
            "focused tools for the needed domain. The explored-map tool is large and "
            "contains only tiles already revealed to the local player. Known-world and "
            "victory tools omit unmet players. Diplomacy omits unmet players, and visible "
            "threats are discovered only on tiles visible this turn. Inspect snapshotStatus "
            "before using a player snapshot: partial, inconsistent or unverified results are "
            "not a complete coherent game state, even when the tool call succeeds."
        ),
    )
    server.tool(
        name="get_civ7_player_snapshot",
        title="Get Civ VII player snapshot",
        description=(
            "Read the loaded local player's Civilization VII strategy snapshot. Inspect "
            "snapshotStatus first: failed domains are null with errors, and observed turn/Age/"
            "player changes are flagged. Successful domains survive other failures. Boundary "
            "checks are not an atomic read or a guarantee against same-turn changes. Includes "
            "empire totals, settlements, growth choices, research and government, "
            "religion, Triumphs and Dedications, resources and trade, units, victory progress, "
            "and known-world summary, plus available decisions, major/city-state diplomacy, visible threats, and turn "
            "context and age-transition planning data. Excludes "
            "the large per-tile explored map and targeted building-placement/movement/combat/"
            "Great-Work relocation/military-logistics queries and the map-scanning archaeology query, "
            "which have separate tools."
        ),
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
        structured_output=True,
    )(snapshot)

    read_only = ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
    server.tool(
        name="get_civ7_empire",
        title="Get Civ VII empire totals",
        description=(
            "Get the local player's treasury, net yields and settlement limit, plus current "
            "leader/persona and civilization ability/unique-item definitions. Identity-linked "
            "trait modifiers include requirement-set evidence, not evaluated activation or "
            "numerical yield contributions. Old-Age/other-persona abilities are not assumed active."
        ),
        annotations=read_only,
        structured_output=True,
    )(empire)
    server.tool(
        name="get_civ7_available_decisions",
        title="Get Civ VII available decisions",
        description=(
            "Get currently available settlement production and purchase choices, costs, "
            "turns, town conversions, and visible unit upgrades. Includes current/engine-offered "
            "town focuses, descriptions, population requirements, eligibility and owned "
            "connection/food evidence. Focus yield comparisons are unknown, not simulated."
        ),
        annotations=read_only,
        structured_output=True,
    )(available_decisions)
    server.tool(
        name="get_civ7_settlements",
        title="Get Civ VII settlement details",
        description=(
            "Get the local player's cities and towns, focuses, growth, specialists, "
            "buildings, districts, Great Work slots, yields, and production queues. "
            "Includes engine-reported yield-source summaries, income modifiers in percent, "
            "maintenance and unattributed base income; missing sources are null, not zero. "
            "Native baseIncomeEvidence adds top-level additive source names/amounts, listedTotal, "
            "residual and matchesSummary; missing/nonadditive evidence stays unknown. It is an "
            "alternative explanation of the same income, not extra yield to add to existing "
            "sources. incomeAdjustment is observed gross income minus base, including native "
            "rounding and penalties, not a policy-swap gain or exact per-card attribution. "
            "Raw calculation contexts/IDs and nested operands are withheld."
        ),
        annotations=read_only,
        structured_output=True,
    )(settlements)
    server.tool(
        name="get_civ7_growth",
        title="Get Civ VII growth choices",
        description=(
            "Get local settlement growth progress, legal expansion choices, separate "
            "improvement placement previews, and specialist slots with yield bonuses, "
            "maintenance changes, and net yield changes per turn. Positive maintenance "
            "changes are costs. Previews are not legal growth choices; options may be "
            "empty until population is ready to place. Hidden tiles are excluded."
        ),
        annotations=read_only,
        structured_output=True,
    )(growth)
    server.tool(
        name="get_civ7_building_placements",
        title="Get Civ VII building placement choices",
        description=(
            "Get legal building/wonder placement tiles for one owned settlement. "
            "Required settlement is an exact displayed name (case-insensitive); optional "
            "constructible is an exact type ID or displayed name. Includes production/"
            "purchase availability, costs, turns, actual placement yield changes, bonus "
            "breakdowns, upkeep changes and overbuilding losses. Positive maintenance "
            "changes are costs. Tile validity does not imply purchase affordability. "
            "Yield totals include engine-reported effects on other settlements. Hidden "
            "tiles are excluded. Read-only: does not place, queue, or purchase anything."
        ),
        annotations=read_only,
        structured_output=True,
    )(building_placements)
    server.tool(
        name="get_civ7_research_and_government",
        title="Get Civ VII research and government",
        description=(
            "Get active and available technologies and civics with costs and unlocks, "
            "plus current government, governmentSelection and celebration picker choices with "
            "passives/benefits, conditional traditions and native eligibility. Government/"
            "celebration availableNow requires a confirmed pending choice, not native permission "
            "alone. Includes policies, traditions, crisis cards, and leader attribute "
            "points, purchased/available perks, effects, prerequisites, base costs and wildcard funding. "
            "Cards include audited base-science estimates for Pet Kot, Milpa I and Tequitl, "
            "with qualifying counts/evidence. Other impacts are explicitly unknown. "
            "Estimates exclude multipliers, cross-yield conversions and non-science effects; "
            "they are not simulated policy-swap totals. In Modern, includes chosen ideology, "
            "policy affiliations, public branch benefit definitions, local branch research checks "
            "and conditional adoption-order bonus definitions. Raw Amount/SlotType definition "
            "arguments are not a promise of locally available slots. Includes entry-civic costs/unlocks; "
            "immediate ideology adoption/change permission and diplomatic impacts remain unknown."
        ),
        annotations=read_only,
        structured_output=True,
    )(research_and_government)
    if enable_writes:
        server.tool(
            name="attack_civ7_unit", title="Attack one visible Civ VII enemy unit",
            description=("CHANGE GAME STATE: one melee/ranged attack by owned deployed unqueued noncommander "
                         "unit_id against explicit target_player/target_unit_id at x/y, with fresh expected_turn. "
                         "Read exact enemy IDs from get_civ7_combat_options.defender. Requires an existing war, "
                         "single currently visible hostile combat unit on an owned/unowned field tile, "
                         "no defensible district/civilian/stack, "
                         "known unpacked/nonreinforcing attacker and native attack permission. Melee is adjacent; "
                         "ranged requires a native attackable picker plot. No war declaration, city capture, "
                         "embarked/air/group attacks or confirmation bypass. May damage or destroy either unit "
                         "and consume movement. Verifies consumed attack/attacker loss plus visible target damage "
                         "or departure, not a kill, predicted damage or safe outcome. Requires user authorization; "
                         "submits once, never automatically retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(attack_unit)
        server.tool(
            name="reinforce_civ7_unit", title="Send Civ VII unit to commander",
            description=("CHANGE GAME STATE: send owned deployed packable unit_id as reinforcement to exact "
                         "owned deployed commander_id with fresh expected_turn. Requires no queued/packed or "
                         "existing different reinforcement assignment, a visible owned target plot offered "
                         "by native REINFORCE_ARMY, and exact selected-plot permission (including full movement). "
                         "Unit may leave the map while travelling. Verifies the native target-army assignment "
                         "and returns native ETA when available; does not claim arrival, safe future travel or "
                         "automatic turn progression. No purchase, redirect, attack or raw operation support. "
                         "Requires user authorization; submits once, never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(reinforce_unit)
        server.tool(
            name="pack_civ7_commander", title="Pack nearby Civ VII units into commander",
            description=("CHANGE GAME STATE: issue native PACK_ARMY for one owned deployed unqueued commander_id "
                         "with fresh expected_turn. This packs ALL currently native-eligible nearby friendly "
                         "units, potentially including eligible civilians, subject to engine capacity; it is "
                         "not per-unit selection. Requires verified owned army membership and native permission. "
                         "Verifies new captured-owned members entered the same army without losing existing "
                         "members. May consume movement/change unit orders. Requires user authorization for "
                         "that whole pack-nearby action; submits once, never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(pack_commander)
        server.tool(
            name="unpack_civ7_commander", title="Unpack Civ VII commander units",
            description=("CHANGE GAME STATE: unpack an owned deployed unqueued commander_id at exact x/y with "
                         "fresh expected_turn. Requires verified packed members, a currently visible owned "
                         "native-offered deployment plot and exact UNPACK_ARMY permission. Engine chooses "
                         "individual member placement; not per-unit targeting. Verifies all previously packed "
                         "members are deployed and membership is empty; partial deployment remains unknown, "
                         "never auto-retried. No attacks, reinforcement or transport. Requires user authorization; "
                         "submits once, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(unpack_commander)
        server.tool(
            name="upgrade_civ7_unit", title="Upgrade Civ VII unit",
            description=("CHANGE GAME STATE: upgrade one owned deployed unqueued unit_id to exact target_unit_type "
                         "from get_civ7_units.upgrade, with max_gold_cost and fresh expected_turn. Requires a "
                         "loaded direct upgrade link and native UPGRADE permission. Price is parsed only from "
                         "the exact observed English native quote; other languages/formats, missing/multiple "
                         "quotes and changed prices are rejected, never estimated. Checks cap/balance twice "
                         "and verifies the changed type/Gold spend: either the original unit transforms or "
                         "disappears with exactly one new target unit on the same tile, excluding baseline units. "
                         "Spends Gold and may consume movement; no "
                         "army-wide upgrades. Requires user authorization; submits once, no automatic retry."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(upgrade_unit)
        server.tool(
            name="promote_civ7_unit", title="Promote Civ VII unit",
            description=("CHANGE GAME STATE: spend earned promotion/commendation eligibility on one exact "
                         "owned deployed unit_id, discipline ID and promotion ID from get_civ7_units, with "
                         "fresh expected_turn. Requires native unit class/discipline membership, picker "
                         "eligibility and exact PROMOTE permission. Rejects queued/off-map units; no point "
                         "grants, raw commands or automatic tree choices. Verifies acquired promotion on the "
                         "same unit, not predicted combat bonuses. Requires user authorization; submits once, "
                         "never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(promote_unit)
        server.tool(
            name="respond_civ7_diplomatic_project", title="Respond to Civ VII cooperative project",
            description=("CHANGE GAME STATE: accept, support or reject one exact incoming action_id from "
                         "get_civ7_diplomacy responseOptions with explicit max_influence_cost and fresh expected_turn. "
                         "Only Open Borders, Research Collaboration, Cultural Exchange and Local Festival from "
                         "met peaceful major leaders; no wars/demands, espionage or deals. Requires native "
                         "offered response/quote/permission and sufficient Influence; rejects missing costs and "
                         "replacement of an existing different response. Support spends Influence; rejection "
                         "can worsen relationships and impose cooldowns. Verifies the same incoming event's "
                         "recorded response, not eventual yields/completion. Requires user authorization; "
                         "submits once, never automatically retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(respond_diplomatic_project)
        server.tool(
            name="choose_civ7_narrative", title="Choose Civ VII narrative response",
            description=("CHANGE GAME STATE: resolve one exact owned pending narrative instance_id/instance_type "
                         "from get_civ7_turn_context with an exact offered choice ID and fresh expected_turn. "
                         "Supports non-trial event/discovery/crisis linked choices whose definition Cost is "
                         "exactly zero, or CLOSE only when no eligible links exist. Paid choices are rejected "
                         "because runtime spending quotes are unavailable. May have permanent scripted rewards "
                         "or negative consequences; no outcome forecast. Uses exact native choice permission "
                         "and verifies that submitted instance leaves the pending queue, not its specific "
                         "reward or every side effect. Requires user authorization; submits once, no automatic retry."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(choose_narrative)
        server.tool(
            name="review_civ7_policies", title="Confirm Civ VII policy review",
            description=("CHANGE GAME STATE: acknowledge a pending policy/tradition/crisis-card screen reminder "
                         "after inspecting get_civ7_research_and_government, with fresh expected_turn. Mirrors "
                         "closing the native screen using CONSIDER_ASSIGN_TRADITIONS; changes no cards and "
                         "does not buy a swap window. Optional slots may remain empty. Requires native "
                         "permission and verifies the specific policy-review notifications clear, not all "
                         "turn blockers. Cannot dismiss government/narrative choices or end a turn. Requires "
                         "user authorization; submits once, never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(review_policies)
        server.tool(
            name="set_civ7_culture_card", title="Set Civ VII policy, tradition or crisis card",
            description=("CHANGE GAME STATE: activate/deactivate one unlocked exact card ID in explicit slot "
                         "group policy, tradition or crisis, with fresh expected_turn. Requires native swap "
                         "permission and an empty destination. Ordinary cards can enter tradition slots only "
                         "when ordinary slots are full; native tradition/crisis cards must use their own group. "
                         "No implicit migrations, automatic replacements or paid swap-window purchase. Verifies "
                         "all three card inventories, preserving every other card. To replace a card, explicitly "
                         "remove then add in separate calls; these are not atomic and removal may succeed even "
                         "if addition fails. Requires user authorization; submits once, no automatic retry."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(set_culture_card)
        server.tool(
            name="acknowledge_civ7_agenda", title="Acknowledge Civ VII agenda message",
            description=("CHANGE GAME STATE: acknowledge exactly one owned NOTIFICATION_DIPLOMATIC_ACTION_AGENDA "
                         "notification_id from get_civ7_turn_context using fresh expected_turn. Mirrors closing "
                         "the agenda popup and verifies that notification is dismissed/removed. It does not "
                         "accept/reject diplomatic proposals or deals, alter relationships, dismiss arbitrary "
                         "notifications or end a turn. Requires user authorization; submits once, never "
                         "automatically retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(acknowledge_agenda)
        server.tool(
            name="choose_civ7_government", title="Choose Civ VII government",
            description=("CHANGE GAME STATE: resolve a pending government choice using an exact current-Age "
                         "government ID and fresh expected_turn. Requires native permission and a government "
                         "picker notification or no current government. Changes celebration choices and may "
                         "change passive effects/unlocks; no policy or ideology changes are selected. Verifies "
                         "current government and cleared picker. Requires user authorization; one submission, "
                         "never retry unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(choose_government)
        server.tool(
            name="choose_civ7_celebration", title="Choose Civ VII celebration",
            description=("CHANGE GAME STATE: select one exact offered celebration ID with fresh expected_turn. "
                         "Requires a pending local celebration notification or Happiness.canChoose, plus "
                         "native permission; cannot start an unearned "
                         "celebration. Applies the selected benefit immediately and may open policy slots. "
                         "Verifies active celebration and cleared choice, not a yield forecast. Requires "
                         "user authorization; submits once, never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(choose_celebration)
        server.tool(
            name="review_civ7_resources", title="Confirm Civ VII resource review",
            description=("CHANGE GAME STATE: acknowledge the pending resource-review prompt after inspecting "
                         "get_civ7_resources_and_trade, using fresh expected_turn. Runs only the native "
                         "CONSIDER_ASSIGN_RESOURCE operation and verifies its specific notification clears. "
                         "Does not assign/unassign resources, dismiss arbitrary notifications, bypass other "
                         "blockers or end the turn. Requires user authorization; submits once, never retries "
                         "unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(review_resources)
        server.tool(
            name="set_civ7_unit_order", title="Set Civ VII unit order",
            description=("CHANGE GAME STATE: set one owned on-map unit_id to skip, sleep, wake, fortify, heal, "
                         "alert or cancel using fresh expected_turn. Fixed non-target native operations only; "
                         "no attacks, travel, disbanding or raw operation strings. An existing queued order "
                         "requires explicit cancel/wake first. Verifies native activity/current operation, "
                         "not eventual healing or a future fortification bonus. Requires user authorization; "
                         "submits once and never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(set_unit_order)
        server.tool(
            name="end_civ7_turn", title="End one Civ VII turn",
            description=("CHANGE GAME STATE: submit exactly one active single-player turn using fresh expected_turn. "
                         "Requires no native turn blockers or ready unit needing an order; never skips blockers, "
                         "forces turn completion or selects pending choices. Waits up to 60 seconds for exactly "
                         "the next active local turn in the same Age/player context. Age transitions/endgame "
                         "continuation need separate handling. Requires explicit action or bounded sandbox "
                         "authorization. Never automatically retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(end_turn)
        server.tool(
            name="set_civ7_town_focus", title="Set Civ VII town focus",
            description=("CHANGE GAME STATE: select an exact engine-offered focus ID or GROWTH for an exact owned "
                         "settlement name, using fresh expected_turn. Only towns; native picker and exact command "
                         "checks are required. Changes town yields/food exports and may stop ordinary growth. "
                         "No town upgrade or turn advancement. Verifies the native focus; no yield forecast. "
                         "Requires user authorization; submits once, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(set_town_focus)
        server.tool(
            name="upgrade_civ7_town", title="Upgrade Civ VII town to city",
            description=("CHANGE GAME STATE: buy one town-to-city upgrade for an exact owned settlement name, "
                         "with approved max_gold_cost and fresh expected_turn. Uses the native upgrade directive, "
                         "fresh town upgrade quote and balance check. Permanently spends Gold and changes town "
                         "economy/production to a city; does not buy a building or choose production. Verifies "
                         "the same owned settlement is a city. Requires user authorization; submits once and "
                         "never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(upgrade_town)
        server.tool(
            name="assign_civ7_specialist", title="Assign Civ VII city specialist",
            description=("CHANGE GAME STATE: spend one ready pending population in an owned city's unblocked "
                         "specialist slot at exact x/y, using an exact settlement name and fresh expected_turn. "
                         "Use get_civ7_growth for legal slots and yield/upkeep previews. Requires capacity and "
                         "exact native ASSIGN_WORKER permission. Verifies that tile's count rises by one and "
                         "pending population falls by one. No town specialists, removal or turn advancement. "
                         "Adds food/happiness upkeep. Requires user authorization; submits once, no automatic retry."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(assign_specialist)
        server.tool(
            name="place_civ7_population",
            title="Place Civ VII pending population",
            description=(
                "CHANGE GAME STATE: consume one ready pending population in an exact owned settlement "
                "name (case-insensitive), placing its native-offered improvement at exact x/y. Use "
                "improvement type ID, legal expansion tile and expected_turn from fresh get_civ7_growth. "
                "Requires an empty revealed nonforeign tile, unique native EXPAND choice and exact "
                "selected-tile permission. No specialist assignment, overbuilding, resettling, special "
                "improvement preview choices or turn advancement. Verifies a new owned undamaged "
                "improvement at that tile and one fewer pending population, not tile ownership alone. "
                "Requires exact-action user approval; submits once, never retries unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(place_population)
        server.tool(
            name="move_civ7_unit",
            title="Move Civ VII unit one adjacent tile",
            description=(
                "CHANGE GAME STATE: move one owned noncommander unit_id (instanceId from get_civ7_units) "
                "to adjacent x/y using fresh expected_turn. Land/sea only; requires positive movement, "
                "known unpacked/nonreinforcing on-map state, an empty currently visible own/unowned "
                "destination, native reachability and a direct one-edge noncombat path. Adjacent land-unit "
                "embarking/disembarking requires consistent native source state and verifies actual "
                "destination embarkation as well as position. No air, foreign territory, fogged travel, "
                "captures, attacks, swaps, "
                "rail/transport, multistep orders or turn advancement. Uses MOVE_TO with NONE modifiers, "
                "not the UI helper that can attack or declare war. Verifies exact owned component/type "
                "and final location. Requires exact-action user approval; submits once and never "
                "automatically retries unknown/cancelled outcomes. Movement is spent, not restored."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(move_unit)
        server.tool(
            name="establish_civ7_trade_route",
            title="Establish Civ VII Merchant trade route",
            description=(
                "CHANGE GAME STATE: use one owned UNIT_MERCHANT unit_id (instanceId from get_civ7_units) "
                "to establish a direct route to an exact target_player_id and target_city_id, using a "
                "fresh expected_turn. Target IDs can come from get_civ7_known_world.visibleForeignSettlements "
                "(ownerId/cityId). Requires a unique engine-offered route, met peaceful counterpart, "
                "revealed target city, unpacked on-map Merchant and exact MAKE_TRADE_ROUTE permission. "
                "Can use the Merchant's action/charges and alter trade/resources. Sends once; verifies "
                "target-specific newly active status and total/counterpart route counts rising by one. "
                "No movement fallback, war, turn advancement or automatic retry after unknown/cancellation. "
                "Requires the user's explicit instruction for this exact Merchant and destination."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(establish_trade_route)
        server.tool(
            name="append_civ7_city_production",
            title="Append Civ VII city production",
            description=(
                "CHANGE GAME STATE: append one exact unit, building or project item type ID to an "
                "owned city's production queue. Required settlement is its exact displayed name "
                "(case-insensitive); expected_turn must come from fresh available-decisions evidence. "
                "Buildings require exact x and y from get_civ7_building_placements with no overbuilding. "
                "Omit x/y for units/projects. Uses native Append and verifies the complete old queue "
                "prefix plus one matching new tail. No town production/focus changes, wonders, repairs, "
                "queue deletion/reordering/replacement or turn advancement. Requires the user's exact-action "
                "instruction. Submits once; never automatically retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(append_city_production)
        server.tool(
            name="purchase_civ7_city_item",
            title="Purchase Civ VII city or town item",
            description=(
                "CHANGE GAME STATE: buy one exact unit or building item type ID in an owned settlement "
                "(exact displayed name, case-insensitive), using an approved max_gold_cost and fresh "
                "expected_turn. Spends Gold, creates an asset and can add maintenance. Buildings require "
                "explicit x/y from get_civ7_building_placements, legal native plots and a no-overbuilding "
                "preview. Omit x/y for units. Verifies one new matching owned unit ID or a new undamaged "
                "building component at the exact tile, not just Gold loss. No projects, wonders, repairs, "
                "town upgrades, queue changes or turn advancement. Requires the user's exact-action "
                "instruction. Submits once; never automatically retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(purchase_city_item)
        server.tool(
            name="select_civ7_technology",
            title="Select Civ VII technology",
            description=(
                "CHANGE GAME STATE: select one local technology using its exact technology.available[].id "
                "and the turn from a fresh get_civ7_research_and_government read as expected_turn. "
                "Requires an active local turn, no existing long-term research target, and a successful "
                "native check. Submits once, then checks read-only state for up to two seconds. "
                "Status is rejected, already_active, "
                "verified_applied or unknown. Unknown/cancelled calls must not be retried automatically. "
                "Does not select civics, clear research targets or advance turns. Requires the user's "
                "explicit instruction to perform this exact gameplay action."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(select_technology)
        server.tool(
            name="select_civ7_civic",
            title="Select Civ VII civic",
            description=(
                "CHANGE GAME STATE: select one local civic using its exact civic.available[].id "
                "and the turn from a fresh get_civ7_research_and_government read as expected_turn. "
                "Requires an active local turn, no existing long-term civic target, and a successful "
                "native check. Submits once, then checks read-only state for up to two seconds. "
                "Status is rejected, already_active, verified_applied or unknown. Unknown/cancelled "
                "calls must not be retried automatically. Does not select technology, change policies, "
                "clear civic targets or advance turns. Requires the user's explicit instruction "
                "to perform this exact gameplay action."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(select_civic)
        server.tool(
            name="set_civ7_policy_active",
            title="Enable or disable Civ VII ordinary policy",
            description=(
                "CHANGE GAME STATE: enable/disable one exact ordinary policy ID from "
                "get_civ7_research_and_government using policy, boolean active and its fresh turn as "
                "expected_turn. Requires an active local turn, an unlocked ordinary card, the native "
                "policy-swap gate and operation check, plus a free ordinary slot when enabling. "
                "Does not swap cards, migrate tradition slots, acknowledge policy notifications, "
                "change crisis/tradition cards or advance turns. Submits once and verifies exact "
                "membership of all three slot groups for up to two seconds. Status is rejected, "
                "already_active, already_inactive, verified_applied or unknown. Never automatically "
                "retry unknown/cancelled calls. Requires the user's explicit instruction for this "
                "exact gameplay action; deactivation can leave an empty slot and change yields."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(set_policy_active)
        server.tool(
            name="assign_civ7_resource",
            title="Assign Civ VII resource",
            description=(
                "CHANGE GAME STATE: assign one owned resource_instance and off_map identity from "
                "get_civ7_resources_and_trade to an exact owned settlement name, using its fresh turn "
                "as expected_turn. Honors the assignment lock, destination capacity and exact native "
                "check. No swaps, bulk clearing or preview requests. Changes resource effects/yields. "
                "Submits once and verifies that resource's assignment for up to two seconds. "
                "Requires the user's exact-action instruction; never retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(assign_resource)
        server.tool(
            name="buy_civ7_attribute_node",
            title="Buy Civ VII leader attribute node",
            description=(
                "CHANGE GAME STATE: buy one first, nonrepeatable leader-attribute node using its "
                "exact attributes.branches[].nodes[].id and fresh expected_turn from "
                "get_civ7_research_and_government. Requires local applicability, milestone/node "
                "eligibility, points and native purchase permission. Can irreversibly spend branch "
                "and/or wildcard points. No repeat purchases or point grants. Submits once and "
                "verifies the node unlock for up to two seconds; before/after balances are observations, "
                "not a fabricated price quote. Requires the user's exact-action instruction; never "
                "retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(buy_attribute_node)
        server.tool(
            name="move_civ7_great_work",
            title="Move Civ VII Great Work",
            description=(
                "CHANGE GAME STATE: move one owned great_work_index from get_civ7_great_works to "
                "an owned destination_city_id and exact destination_building type ID from its "
                "buildings inventory, using fresh expected_turn. Requires a unique owned instance, "
                "undamaged source/destination, free capacity and native compatibility. Archived works "
                "omit SourceCity. No occupied-slot swaps or archiving. Changes display location and "
                "possibly yields; no marginal yield forecast is claimed. Submits once and verifies "
                "the exact instance location for up to two seconds. Requires the user's exact-action "
                "instruction; never retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(move_great_work)
        server.tool(
            name="start_civ7_diplomatic_project",
            title="Start Civ VII diplomatic project",
            description=(
                "CHANGE GAME STATE: start one project with a met major target_player_id using an exact "
                "action ID, approved max_influence_cost and fresh expected_turn. Supported actions: "
                "DIPLOMACY_ACTION_OPEN_BORDERS, DIPLOMACY_ACTION_RESEARCH_COLLABORATION, "
                "DIPLOMACY_ACTION_CULTURAL_EXCHANGE. Uses the selected target's native quote and exact "
                "operation check. Spends Influence and can affect relationships. No wars, deals, "
                "secondary targets, espionage or turn advancement. Submits once and verifies a new "
                "matching local-initiated project record, not eventual acceptance or completion. "
                "Requires the user's exact-action instruction; never retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(start_diplomatic_project)
        server.tool(
            name="start_civ7_city_state_project",
            title="Start Civ VII city-state project",
            description=(
                "CHANGE GAME STATE: start one project with a met city-state target_player_id using "
                "an exact action ID, approved max_influence_cost and fresh expected_turn. Supported: "
                "DIPLOMACY_ACTION_CS_PROMOTE_GROWTH, DIPLOMACY_ACTION_CS_BOLSTER_MILITARY, "
                "DIPLOMACY_ACTION_CS_INCORPORATE. Incorporation requires local suzerainty, spends "
                "Influence and permanently adds the city-state as a town when the project completes; "
                "this tool only initiates it. No secondary targets, levying, bonus selection, forced "
                "annexation or turn advancement. Submits once and verifies a new matching own project "
                "record. Requires the user's exact-action instruction; never retry unknown/cancelled calls."
            ),
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False,
            ),
            structured_output=True,
        )(start_city_state_project)
    server.tool(
        name="get_civ7_religion",
        title="Get Civ VII religion and belief choices",
        description=(
            "Get the local player's religion, selected pantheons and beliefs with effects, "
            "holy city, belief-class slots, and owned settlements' majority, urban and "
            "rural religions. Distinguishes global belief claimability, picker slot "
            "availability, choices available now, and choices selectable during founding. "
            "Foreign founders are identified only when met; no hidden world totals. "
            "Owned units with positive base SpreadCharges include current non-target spread "
            "operation readiness, native charges remaining and action-panel additionalDescriptions; "
            "arbitrary target conversion previews remain unknown. Owned commander membership and "
            "on-map state gate readiness; packed/off-map units and unknown packing evidence are "
            "not queried as deployed missionaries, even with valid-looking coordinates. "
            "Read-only: does not found religions, select beliefs, or convert settlements."
        ),
        annotations=read_only,
        structured_output=True,
    )(religion)
    server.tool(
        name="get_civ7_great_works",
        title="Get Civ VII Great Work inventory and relocation evidence",
        description=(
            "Read owned archived/displayed Great Works with stable instanceIndex values and "
            "owned building capacities/current Great Work yield totals. Optional great_work_index "
            "checks one owned instance's native relocation eligibility and reasons for owned "
            "building types with empty capacity. Current yields are not marginal relocation "
            "gains. Targeted destinations also carry cityWorkTypeYieldQuote from the pure tooltip "
            "getter, using a work-definition index: city/work-type only, not instance-specific, "
            "building-specific or an applied relocation forecast. Do not subtract quotes into "
            "a guessed net gain; swaps and net yield changes remain unknown. Never selects, moves or archives "
            "works. Targeted relocation data is excluded from player snapshots."
        ),
        annotations=read_only,
        structured_output=True,
    )(great_works)
    server.tool(
        name="get_civ7_archaeology",
        title="Get Civ VII archaeology and Explorer readiness",
        description=(
            "In Modern, read revealed UI-filtered ruins, research buildings and natural wonders, "
            "local research status on revealed continents, owned artifact-extracting Explorer "
            "readiness, and owned Great Work display capacity. Explorer excavation/research "
            "permission and blockers apply only at the current position, not after moving to "
            "candidate sites. Fogged observations may be stale. No hidden ruin totals, artifact "
            "rewards, compatibility or projected Tourism are inferred. No actions or UI selection. "
            "This map-scanning query is separate from snapshots; outside Modern it is not applicable."
        ),
        annotations=read_only,
        structured_output=True,
    )(archaeology)
    server.tool(
        name="get_civ7_resources_and_trade",
        title="Get Civ VII resources and trade",
        description=(
            "Get the local player's resources, settlement assignments and free slots, "
            "trade-network state, read-only per-resource assignment eligibility, current "
            "route count and known revealed route candidates including blocked routes/reasons. "
            "Includes owned rail-network membership, station presence and land-capital connectivity; "
            "Modern factory state/counts and native factory/station build/purchase reasons. "
            "Factory GDP and marginal production are unknown; station presence is not connectivity. "
            "Resource/focus marginal yields and Merchant-specific route eligibility are unknown. "
            "Does not assign resources or invoke stateful preview requests."
        ),
        annotations=read_only,
        structured_output=True,
    )(resources_and_trade)
    server.tool(
        name="get_civ7_units",
        title="Get Civ VII units",
        description=(
            "Get only the local player's units, locations, health, movement, experience, "
            "promotions, commander packing state, and stable instanceId values for targeted queries. "
            "isPacked/isReinforcing are nullable: true is observed membership/assignment, false "
            "is observed absence, null is unknown. Legacy null commander fields alone do not "
            "prove absence. Packed/off-map units and unknown packing evidence withhold locations; "
            "a withheld location does not prove packing. These fields also pass through snapshots. "
            "Includes unowned promotion/commendation choices, effects, prerequisite ownership, "
            "picker eligibility and native operation checks; prerequisite logic is not inferred."
        ),
        annotations=read_only,
        structured_output=True,
    )(units)
    server.tool(
        name="get_civ7_military_logistics",
        title="Get Civ VII military logistics",
        description=(
            "Read owned commander/carrier/squadron/aerodrome capacities and packed-unit membership, "
            "air units, reinforcement assignments/native arrival quotes and WMD stockpile counts. "
            "Optional unit_id from get_civ7_units checks one owned unit's native rebase/reinforce "
            "destinations, filtered to explicitly revealed/visible tiles; unknown visibility "
            "withholds destinations, not native permission. A selected deployed commander also "
            "reports native pack-nearby permission and exact checked unpack destinations restricted "
            "to currently visible owned plots. Unknown commander membership "
            "withholds deployment checks/locations; a withheld location does not prove packing. "
            "Missing assignment APIs leave reinforcements null; missing arrival getters leave "
            "nativeArrivalTime null. Packed/off-map units are not queried as deployed. "
            "Free slots, mission ranges and travel forecasts are not inferred; WMD launch checks, "
            "strikes and all movement requests are excluded. Separate from snapshots/exports."
        ),
        annotations=read_only,
        structured_output=True,
    )(military_logistics)
    server.tool(
        name="get_civ7_movement_and_founding",
        title="Get Civ VII unit movement and founding evidence",
        description=(
            "Read one owned unit by its integer instanceId from get_civ7_units. Returns "
            "revealed movement options and optional destination path/site evidence. Supply "
            "both x and y, or omit both to inspect the unit's location. Native path turn "
            "labels are retained; paths through hidden tiles are withheld. Settlers include "
            "current/adjacent founding checks; arbitrary future-site legality and new "
            "settlement yields are unknown. Site evidence includes fresh water, current tile "
            "yields, nearby revealed resources and owned settlement distances. Separate rail command "
            "eligibility and revealed native rail destination plots are included; rail travel cost "
            "and paths are unknown. Never moves, transports by rail or founds."
        ),
        annotations=read_only,
        structured_output=True,
    )(movement_and_founding)
    server.tool(
        name="get_civ7_combat_options",
        title="Get Civ VII combat eligibility and evidence",
        description=(
            "Read one owned unit by integer instanceId and a target x/y. Target tiles must "
            "be currently visible; only visible hostile defenders belonging to met players "
            "are exposed. Returns read-only melee/ranged/naval/air attack checks and observable "
            "health/non-contextual strength. Includes attacker readiness, whitelisted local "
            "reported modifiers, visible terrain definition values and a separate commander-attack "
            "command check requiring this target in native plots. Reported modifiers are not "
            "applied contextual totals. Damage predictions, contextual strengths and outcomes "
            "are unknown, not simulated. Never attacks, declares war, selects units or invokes "
            "asynchronous simulation requests."
        ),
        annotations=read_only,
        structured_output=True,
    )(combat_options)
    server.tool(
        name="get_civ7_known_world",
        title="Get Civ VII known world",
        description=(
            "Get only met leaders, city-states and independents, plus an aggregate of "
            "terrain, features, and resources already revealed to the local player. Includes "
            "basic visibleForeignSettlements metadata only when the met owner's settlement "
            "centre is currently visible. No fogged settlement inventory, private yields, "
            "production queues, religion or garrisons are queried."
        ),
        annotations=read_only,
        structured_output=True,
    )(known_world)
    server.tool(
        name="get_civ7_victory_progress",
        title="Get Civ VII victory progress",
        description=(
            "Get Test of Time victory conditions, thresholds, countdowns, prerequisites, "
            "and progress for the local player and met major players only. Includes loaded "
            "campaign-specific dominance tier schedules with current/next ratios and Age-progress "
            "thresholds, met-player countdown alerts and conditional public scoring rules. Never "
            "assume Culture requires a permanent 4x lead: ratios can ease as the Age progresses. "
            "Native point targets remain authoritative; alerts are not unconditional win dates. "
            "Culture scoringRules include activation-effect definitions and bounded research/"
            "policy evidence; mastery depth or a slotted card is not proof of actual tracker "
            "activation, whose activeForLocalPlayer remains unknown. "
            "Culture localEvidence links owned wonder/tagged-unique-improvement candidates, "
            "trait-linked buildings plus native uniqueQuarters with building completion/damage, "
            "displayed versus archived works, rail membership and required-building observations "
            "to tracker-family-only ledgerEntryIndices in local progress.scoring. Candidates are "
            "not certified Tourism qualifiers; quarter recognition is not reconstructed from "
            "building pairs. Missing native evidence stays unknown. Repeated ledger links must not be summed or attributed "
            "per rule. Requirement scope, qualifying counts and incremental Tourism stay unknown. "
            "Modern production-project requirements and owned-settlement BUILD eligibility, "
            "blocked reasons, prerequisite scopes, mastery unlock depths and current cost/turn "
            "quotes. Project inventory includes conversion projects, not just victory projects. "
            "Completed project counts and victory-completion forecasts remain unknown."
        ),
        annotations=read_only,
        structured_output=True,
    )(victory_progress)
    server.tool(
        name="get_civ7_diplomacy",
        title="Get Civ VII diplomacy",
        description=(
            "Get relationships, modifiers, deal counts, ongoing projects, and available "
            "diplomatic actions involving met major counterparts. Includes public term "
            "definitions, native duration quotes, active stages and native event progress/"
            "completion timing, not guaranteed agreement expiry dates. Pending visible incoming "
            "projects include responseOptions with native descriptions, Influence quotes, selectability "
            "and exact response-operation eligibility; these are not predicted final outcomes. Safe secondaryTargets "
            "include met/local players, offered owned settlements, offered currently visible "
            "settlement centres of the met counterpart, public unit types and amounts, with "
            "owner-qualified City identity, exact selected-argument checks and failure reasons. "
            "City IDs alone never prove ownership; ambiguous plots, hidden/fogged foreign centres "
            "and unrelated owners are omitted. No foreign inventory/private yields/queues are read. "
            "Other target types are omitted, so lists are partial and total costs remain "
            "unknown. Incoming hidden/espionage events are not attributed to a leader. Enacted "
            "peace-deal item terms and working-deal negotiations are unsupported; never changes "
            "or sends deals."
        ),
        annotations=read_only,
        structured_output=True,
    )(diplomacy)
    server.tool(
        name="get_civ7_city_states",
        title="Get Civ VII city-state and independent diplomacy",
        description=(
            "Get met city-states and met/discovered independent powers, suzerains, current "
            "bonus effects and eligible bonus choices, local influence, diplomatic action "
            "eligibility and selected-target costs including incorporation, plus your "
            "ongoing befriending progress and support costs. Bonus eligibility is not a "
            "pending selection; actions may require secondary targets. Omits hidden "
            "locations, unmet suzerain identities, and other players' ongoing projects. "
            "Read-only: never spends influence, selects bonuses, or incorporates powers."
        ),
        annotations=read_only,
        structured_output=True,
    )(city_states)
    server.tool(
        name="get_civ7_visible_threats",
        title="Get Civ VII visible threats",
        description=(
            "Get enemy units belonging to met players only when those units are on tiles "
            "currently visible to the local player."
        ),
        annotations=read_only,
        structured_output=True,
    )(visible_threats)
    server.tool(
        name="get_civ7_turn_context",
        title="Get Civ VII turn context",
        description=(
            "Get active quests, crisis timing, notifications, deadlines, and Age progress "
            "for the local player. Includes pending local narrative/crisis response choices, "
            "injected rewards/actions, base costs, affordability and read-only eligibility. "
            "Trial-specific choices and runtime cost quotes are unknown. Owned crisis settlement "
            "evidence includes infection, revealed plague durations, damage and happiness/unrest; "
            "damage cause and numerical crisis yield penalties are not inferred. Never triggers "
            "events, selects responses or changes turn/UI state."
        ),
        annotations=read_only,
        structured_output=True,
    )(turn_context)
    server.tool(
        name="get_civ7_age_transition",
        title="Get Civ VII age-transition planning data",
        description=(
            "Read next-Age civilization candidates from the transition-specific selector, "
            "native local unlock requirements/progress and current/transition Memento setup "
            "candidates. Includes current engine Dedication deck costs, limits and eligibility; "
            "current cards are not presented as next-Age choices. Profile Memento unlock/equip "
            "permission and unavailable future cards remain unknown. Carry-over caps are labelled "
            "source-inspected estimates, not a verified final-state simulation. Never selects "
            "civilizations/cards/Mementos, queries online profile data or advances the Age."
        ),
        annotations=read_only,
        structured_output=True,
    )(age_transition)
    server.tool(
        name="get_civ7_explored_map",
        title="Get Civ VII explored map",
        description=(
            "Get detailed terrain, features, resources, water, rivers, and yields for "
            "tiles already revealed to the local player. This response can be large."
        ),
        annotations=read_only,
        structured_output=True,
    )(explored_map)
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Sidkick MCP service")
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default="streamable-http",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--enable-writes", action="store_true",
        help="Expose supported gameplay actions, which change the loaded game (stdio only)",
    )
    args = parser.parse_args()
    if args.enable_writes and args.transport != "stdio":
        parser.error("--enable-writes requires --transport stdio")

    server = create_server(enable_writes=args.enable_writes)
    if args.transport == "stdio":
        server.run(transport="stdio")
    else:
        server.run(
            transport="streamable-http",
            host=args.host,
            port=args.port,
            streamable_http_path="/mcp",
            json_response=True,
            stateless_http=True,
        )


if __name__ == "__main__":
    main()
