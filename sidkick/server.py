"""On-demand MCP service for Sidkick game adapters."""

import argparse
from base64 import b64encode
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.types import Icon, ToolAnnotations

from civ7.actions import (
    attack_unit,
    army_ranged_attack,
    army_melee_attack,
    army_overrun,
    grant_second_wind,
    ranged_attack_enemy_field,
    join_commander,
    leave_commander,
    join_fleet,
    leave_fleet,
    rebase_aircraft,
    naval_attack_unit,
    rail_commander,
    rail_unit,
    upgrade_army,
    acknowledge_agenda,
    append_city_production,
    assign_resource,
    unassign_resource,
    swap_resources,
    edit_production_queue,
    commander_attack,
    advance_unit,
    bombard_district,
    pillage_tile,
    air_attack_unit,
    coastal_raid,
    melee_attack_enemy_field,
    bombard_shore_district,
    naval_attack_land_unit,
    append_advanced_construction,
    choose_religious_action,
    befriend_independent,
    choose_city_state_bonus,
    local_civilian_action,
    resettle_migrant,
    connect_merchant_road,
    archive_great_work,
    declare_war,
    start_hostile_diplomatic_project,
    pillage_route,
    transfer_aircraft,
    air_attack_from_commander,
    cross_commander_shore,
    clear_factory_resources,
    assault_city,
    resolve_city_capture,
    assign_specialist,
    buy_attribute_node,
    choose_celebration,
    choose_government,
    choose_narrative,
    establish_trade_route,
    end_turn,
    move_great_work,
    move_unit,
    move_commander,
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
            name="assault_civ7_city",title="Explicitly assault or occupy Civ VII settlement centre",
            description=("CHANGE GAME STATE: adjacent land combat unit_id against exact met wartime "
                         "target_player/target_city_id centre x/y, mode melee/occupy and expected_turn. "
                         "Explicitly permits city capture. Requires ready unqueued unembarked unpacked/"
                         "nonreinforcing unit, visible empty enemy centre (no garrison/civilian/stack), "
                         "native reachable target and exact melee/NO_COMBAT occupation classification plus "
                         "selected permission. Occupy needs direct current-turn path. Verifies attack/movement "
                         "consumption plus primary district damage or exact new owned city preserving prior "
                         "settlements. Capture keep/raze remains separate; no automatic disposition, new war, "
                         "kill/splash/full conquest accounting or turn advance. One submission,15-second readback; no retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(assault_city)
        server.tool(
            name="resolve_civ7_city_capture",title="Keep or begin razing captured Civ VII city",
            description=("CHANGE GAME STATE: exact owned city_id, explicit choice keep/raze and expected_turn. "
                         "Requires currently visible owned city with unresolved isJustConqueredFrom capture "
                         "choice, not already razing, and native DESTROY/Directive permission. Keep verifies "
                         "choice consumed with city retained; raze verifies razing started or immediate city "
                         "disappearance, not eventual destruction. Razing can destroy settlement assets. "
                         "No liberation, foreign transfer or turn advance. One submission,15-second readback; no retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(resolve_city_capture)
        server.tool(
            name="clear_civ7_factory_resources",title="Clear one Civ VII factory specialization",
            description=("CHANGE GAME STATE: explicit native factory Clear in exact settlement with current "
                         "factory resource definition resource, commerce factory.clearToken as target_token "
                         "and expected_turn. Requires active Modern turn, unlocked assignments, exact existing "
                         "factory/type/count/resources, complete owned assignment ledger and native permission. "
                         "Releases all of that city's selected factory resources. Verifies factory count zero, "
                         "unchanged owned inventory and every other city/nonfactory assignment preserved. "
                         "Use ordinary checked assignment afterwards; type-changing assignment refuses an "
                         "existing different specialization. Clear/reassign is explicitly non-atomic; stop "
                         "on failed/unknown stages. No GDP/yield forecast, automatic rollback or turn advance."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(clear_factory_resources)
        server.tool(
            name="cross_civ7_commander_shore",title="Cross one Civ VII shore with packed army",
            description=("CHANGE GAME STATE: fixed MOVE_TO of exact ready deployed land commander_id across "
                         "one adjacent land/water edge to empty visible own/unowned x/y with expected_turn. "
                         "Requires consistent native source embarkation, direct current-turn path, reachable "
                         "noncombat tile, native NO_COMBAT and selected permission. Captures packed members "
                         "and verifies exact arrival, embark/disembark state, clear queue and unchanged army. "
                         "For same-water embarked travel use existing bounded commander movement. No landing "
                         "attack, foreign territory, capture, implicit packing or future-turn orders. "
                         "One submission,15-second readback; never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(cross_commander_shore)
        server.tool(
            name="air_attack_civ7_from_commander",title="Strike Civ VII field unit from captured air commander",
            description=("CHANGE GAME STATE: fixed native AIR_ATTACK by exact aircraft unit_id stationed in "
                         "exact source_commander_id Aerodrome/squadron/carrier, against target_player/"
                         "target_unit_id at x/y with expected_turn. Requires ready aircraft, visible owned "
                         "base on own/unowned tile (carrier on water), known full membership and one exact "
                         "visible enemy land/sea combat target on own/unowned non-district field, existing "
                         "met war and exact native offered/selected permission. Verifies attack consumption/"
                         "loss plus primary-target damage/departure and exact surviving base memberships. "
                         "No district bombing, enemy territory, grouped mission, full interception/splash, "
                         "kill, recharge, new war or turn claim. One submission,15-second readback; no retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(air_attack_from_commander)
        server.tool(
            name="transfer_civ7_aircraft",title="Transfer one Civ VII aircraft to an air commander",
            description=("CHANGE GAME STATE: fixed native REBASE by exact aircraft unit_id into exact owned "
                         "target_commander_id Aerodrome/squadron/carrier with expected_turn. Requires unique "
                         "visible deployed unqueued air commander at destination, carrier on water, own/unowned "
                         "tile and exact native offered/selected permission. Source may be one captured base, "
                         "squadron or carrier, or deployed aircraft. Captures every owned army and verifies "
                         "off-map stationing, exact source/destination membership delta, clear queue and stable "
                         "health while preserving all other members. Rejects multiple air commanders sharing "
                         "the target tile rather than guessing native selection. No air mission, new war, "
                         "commander/squadron movement or turn advancement. One submission,15-second readback; no retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(transfer_aircraft)
        server.tool(
            name="pillage_civ7_route",title="Pillage exact occupied Civ VII enemy route",
            description=("CHANGE GAME STATE: fixed native PILLAGE_ROUTE under exact ready owned land combat "
                         "unit_id, target_player, x/y, combat-options routePillage.targetToken as target_token "
                         "and expected_turn. Requires visible existing met-war enemy non-centre tile occupied "
                         "only by this unpacked/nonreinforcing unit, known visible owning centre elsewhere, "
                         "fresh exact route identity and native offered/selected permission. Verifies movement "
                         "spend, stable unit location and visible route type change/departure, not loot, "
                         "improvement damage, capture or future connectivity. One submission,15-second readback; "
                         "no retry, new war or turn advancement."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(pillage_route)
        server.tool(
            name="declare_civ7_war",title="Declare Civ VII surprise or formal war",
            description=("CHANGE GAME STATE: explicit native DECLARE_WAR against exact met major target_player_id, "
                         "war_type surprise/formal and expected_turn. Requires native declaration eligibility "
                         "and exact selected permission on a fresh active turn; already at war is a no-op. "
                         "Native alliances, war support, relationships and other players may be affected. "
                         "Verifies only exact bilateral war, not all diplomatic cascades. No peace deal, "
                         "automatic combat or turn advancement. One submission,15-second readback; never retry unknown."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(declare_war)
        server.tool(
            name="start_civ7_hostile_diplomatic_project",title="Start capped Civ VII sanction or espionage",
            description=("CHANGE GAME STATE: one exact offered fixed sanction/espionage action against met major "
                         "target_player_id with max_influence_cost and expected_turn. Supports denouncement, "
                         "military-presence denouncement, treasury/morale/research/civic/military-production "
                         "sabotage, counterspy, military sabotage/infiltration and tech/civic theft. Native "
                         "offered primary-target quote, sufficient Influence and selected permission required, "
                         "including wartime only if native allows. No secondary targets, arbitrary action, war "
                         "declaration or hidden foreign inventory reads. Verifies one new locally initiated "
                         "event, not completion, secrecy, stolen reward or all relationship effects. One submission; no turn advance/retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(start_hostile_diplomatic_project)
        server.tool(
            name="archive_civ7_great_work",title="Archive one owned Civ VII Great Work",
            description=("CHANGE GAME STATE: native MOVE_GREAT_WORK to archive for exact owned "
                         "great_work_index and fresh expected_turn. Requires a complete unique owned work "
                         "ledger, exact displayed source in an undamaged owned building and native archive "
                         "permission without confirmation. Already archived is a no-op. Verifies exact "
                         "archive location and preservation of every other owned work's ownership/location. "
                         "Use existing move tool to redisplay into a native-compatible empty slot. Combined "
                         "archive/move sequences can exchange works but are explicitly non-atomic: stop on "
                         "unknown/failed stages, never blind retry or auto-rollback. No Tourism/yield forecast "
                         "or turn advancement. One submission."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(archive_great_work)
        server.tool(
            name="connect_civ7_merchant_road",title="Connect owned Civ VII cities by Merchant road",
            description=("CHANGE GAME STATE: native CONNECT_WITH_ROAD by exact ready deployed Merchant "
                         "unit_id at a visible owned city centre to exact visible owned target_city_id centre, "
                         "fresh expected_turn. Requires currently disconnected endpoints, known unpacked/"
                         "nonreinforcing source and exact native offered/selected permission without extra "
                         "cost/confirmation. No guessed path, foreign destination or MOVE_TO fallback. Verifies "
                         "Merchant consumption/movement spend plus new bidirectional endpoint connection and "
                         "preserved prior links, not every road hex. No turn advancement. One submission, "
                         "15-second readback; never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(connect_merchant_road)
        server.tool(
            name="resettle_civ7_migrant",title="Resettle Civ VII Migrant into chosen improvement",
            description=("CHANGE GAME STATE: consume exact ready owned Migrant unit_id into exact "
                         "visible empty native expansion x/y and improvement with fresh expected_turn. "
                         "Requires captured owned source settlement, known unpacked/nonreinforcing source, "
                         "same-settlement or unowned destination (no tile transfer), matching paired native "
                         "RESETTLE plot/improvement and selected permission without confirmation. Verifies "
                         "Migrant consumption, one exact new improvement and population/pending increase in "
                         "the captured city. No guessed city-centre target, overbuilding, specialist, "
                         "foreign transfer or turn advancement. One submission,15-second readback, no retry."),
            annotations=ToolAnnotations(readOnlyHint=False,destructiveHint=True,idempotentHint=False,openWorldHint=False),structured_output=True,
        )(resettle_migrant)
        server.tool(
            name="perform_civ7_local_civilian_action", title="Perform current-tile Civ VII civilian activity",
            description=("CHANGE GAME STATE: fixed kind found/excavate/research/spread/great_person/resettle "
                         "by exact unit_id at its current visible own/unowned tile with fresh expected_turn. "
                         "Optional exact ability must be linked to that fixed native operation/command. "
                         "Requires ready deployed unembarked unqueued role-eligible unpacked/nonreinforcing "
                         "unit, no foreign stack and native selected permission without confirmation. "
                         "Excavation also accepts a visible UI-filtered ruin outside any settlement under "
                         "the native neutral-owner sentinel. Found "
                         "requires unowned non-settlement tile; spread/resettle currently owned settlement "
                         "only. Verifies exact new settlement/consumed settler, exact archaeology order/research "
                         "change, spread/Great Person charge or unit consumption, or resettle consumption plus "
                         "population/pending increase. Queued archaeology is not completion/artifact reward; "
                         "consumption is not full religious/Great Person effect accounting. No movement, "
                         "foreign conversion, adjacent founding, road building, turn or Age advancement. "
                         "One submission,15-second readback, never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(local_civilian_action)
        server.tool(
            name="befriend_civ7_independent", title="Befriend one known Civ VII independent power",
            description=("CHANGE GAME STATE: start one fixed native GIVE_INFLUENCE_TOKEN project for "
                         "exact met/discovered independent target_player_id with max_influence_cost and "
                         "fresh expected_turn. Uses exact offered native project/primary-target quote and "
                         "operation, no secondary target, sufficient known Influence and selected permission. "
                         "Independent hostility may change through befriending; no guessed diplomacy costs "
                         "or major-player war action. Verifies one new local project/event; completion, "
                         "suzerainty or future-turn progress not claimed. One submission, no unknown retry."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(befriend_independent)
        server.tool(
            name="choose_civ7_city_state_bonus", title="Choose pending Civ VII city-state bonus",
            description=("CHANGE GAME STATE: select exact bonus definition for exact city_state_id and "
                         "expected_turn. Requires met minor, local suzerainty, that exact pending bonus "
                         "picker, native canHaveBonus and selected operation permission. Verifies chosen "
                         "bonus and consumed pending choice under preserved suzerainty, not every resulting "
                         "yield/unit/resource effect. No levy, forced suzerainty or turn advancement. "
                         "One submission, never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(choose_city_state_bonus)
        server.tool(
            name="choose_civ7_religious_action", title="Choose Civ VII pantheon, belief or religion",
            description=("CHANGE GAME STATE: one fixed kind pantheon/belief/found with exact choice "
                         "BeliefType or ReligionType and expected_turn. Requires fresh active local turn, "
                         "known current selections and native exact permission without confirmation. "
                         "Pantheon requires unlocked choice; beliefs require founded religion, claimability "
                         "and a genuinely free UI belief-class slot, not ADD_BELIEF permission alone. Found "
                         "requires native canCreateReligion and unclaimed exact religion. Verifies exact "
                         "selection collections/religion with prior choices preserved. Found does not pick "
                         "beliefs automatically; subsequent mandatory choices remain. No rename, spread, "
                         "foreign religion mutation or turn advance. One submission, never retry unknown."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(choose_religious_action)
        server.tool(
            name="append_civ7_advanced_construction", title="Queue advanced Civ VII construction",
            description=("CHANGE GAME STATE: append one exact item/settlement/x/y with explicit "
                         "construction_intent wonder/repair/overbuild/improvement, fresh building-placement "
                         "targetToken as target_token and expected_turn. Owned visible city tile, exact "
                         "constructible class, known tile ledger, native offered/selected BUILD/Append and "
                         "matching intent required. Repair binds one damaged completed instance; overbuild "
                         "binds one intact old building to the native replacement preview. Wonder/improvement "
                         "may replace one exact intact rural improvement only with replace_improvement=true "
                         "and the matching preview/token; otherwise replacement is rejected. This explicitly "
                         "acknowledges eventual replacement. No purchase, bulk repair or instant completion; verifies only exact "
                         "queue append/placement and preserved prefix, not completion/yields/Wonder ownership. "
                         "No turn advancement. One submission, never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(append_advanced_construction)
        server.tool(
            name="naval_attack_civ7_land_unit", title="Fire Civ VII ship at coastal land unit",
            description=("CHANGE GAME STATE: fixed native NAVAL_ATTACK from exact ready deployed naval "
                         "combat unit_id on water against exact target_player/target_unit_id on visible "
                         "enemy-owned non-centre, non-defensible land tile x/y with fresh expected_turn. Existing met war, "
                         "known unpacked/nonreinforcing source, one exact visible land combat defender, "
                         "visible owning centre elsewhere and native offered/selected permission required. "
                         "Non-defensible district unit targets allowed; no landing, district/city entry, "
                         "capture, civilian/stack target or new war. Verifies "
                         "attack consumption/loss plus primary-target damage/departure, not kill/full splash. "
                         "One submission,15-second readback, no unknown retry or turn advancement."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(naval_attack_land_unit)
        server.tool(
            name="melee_attack_civ7_enemy_field", title="Melee attack on Civ VII enemy field",
            description=("CHANGE GAME STATE: adjacent native MOVE_TO/ATTACK by exact owned unit_id "
                         "against exact target_player/target_unit_id at visible enemy-owned x/y with fresh "
                         "expected_turn. Existing met war, ready deployed unqueued unpacked/nonreinforcing "
                         "combat unit, unique visible defender, native reachable/tested melee target and "
                         "selected permission required. Positively excludes districts and visible owning "
                         "city centre; no capture, civilian/stack target or new war. Attacker may enter "
                         "the field, take damage or die. Verifies attack consumption/loss and primary-target "
                         "damage/departure, not a kill/full splash. One submission,15-second readback, no "
                         "unknown/cancelled retry or turn advancement."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(melee_attack_enemy_field)
        server.tool(
            name="bombard_civ7_shore_district", title="Bombard Civ VII district from sea",
            description=("CHANGE GAME STATE: fixed native NAVAL_ATTACK by exact deployed naval combat "
                         "unit_id on water against exact visible hostile land target_player/district_id "
                         "at x/y with fresh expected_turn. Same ready/known-membership and native offered/"
                         "selected checks as district bombardment. Existing met war only. Verifies attack "
                         "consumption/loss plus primary district damage/departure; garrison/retaliation/"
                         "splash not completely verified. No landing/capture, air strike, new war or turn "
                         "advancement. One submission,15-second readback, never retry unknown/cancelled."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(bombard_shore_district)
        server.tool(
            name="coastal_raid_civ7_tile", title="Raid one Civ VII coastal tile",
            description=("CHANGE GAME STATE: native COASTAL_RAID by exact mobile deployed naval combat "
                         "unit_id on visible water against adjacent empty visible enemy land x/y, exact "
                         "target_player, combat-options pillage.targetToken and expected_turn. Requires an "
                         "existing met war, intact complete constructible, visible owning centre elsewhere, "
                         "known unpacked/nonreinforcing source and exact native offered/selected permission. "
                         "Native selects the constructible; verifies source movement spend, unchanged ship "
                         "location and visible new target damage/departure. No exact loot/healing, centre "
                         "attack, landing/capture, route pillage, new war or turn advancement. One submission, "
                         "15-second read-only readback; never retry unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(coastal_raid)
        server.tool(
            name="air_attack_civ7_unit", title="Strike one Civ VII unit from city Aerodrome",
            description=("CHANGE GAME STATE: native AIR_ATTACK by exact owned aircraft unit_id stationed "
                         "in one captured visible owned city Aerodrome against exact wartime target_player/"
                         "target_unit_id at visible x/y with fresh expected_turn. Requires ready unqueued "
                         "nonreinforcing aircraft, complete known owned army membership, a single hostile "
                         "land/sea combat target on own/unowned non-district field and exact native offered/"
                         "selected permission. Verifies aircraft attack consumption/loss plus primary-target "
                         "damage/departure, surviving source-base identity and preservation of every other "
                         "packed member. No standalone deployed, squadron/carrier or district/city strike, "
                         "enemy territory, air-to-air, nuclear mission, new war or turn advancement. Native "
                         "retaliation/interception/splash can occur but is not completely verified; no kill "
                         "or mission-recharge claim. Submits once; polls read-only for15 seconds, never retries "
                         "unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(air_attack_unit)
        server.tool(
            name="pillage_civ7_tile", title="Pillage occupied Civ VII enemy tile",
            description=("CHANGE GAME STATE: native constructible pillage by exact unit_id already on "
                         "wartime target_player's visible non-centre x/y. Supply fresh combat-options "
                         "pillage.targetToken and expected_turn. Requires mobile deployed unqueued unembarked "
                         "unpacked/nonreinforcing land combat unit, no other units on that tile, a visible "
                         "owning city centre elsewhere, intact complete constructible, unchanged full tile "
                         "token and exact offered/selected native PILLAGE permission. Native chooses which "
                         "building/improvement is damaged; verifies movement spend and visible new damage/"
                         "departure, not exact loot/healing or complete secondary effects. No city entry, "
                         "capture, route pillage, coastal raid, war declaration or turn advancement. Submits "
                         "once, polls read-only for 15 seconds, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(pillage_tile)
        server.tool(
            name="bombard_civ7_district", title="Ranged attack on Civ VII hostile district",
            description=("CHANGE GAME STATE: one land ranged/siege attack by exact owned unit_id against "
                         "exact wartime target_player/district_id at visible x/y with fresh expected_turn. "
                         "District identity is available from combat-options defender when kind=district. "
                         "Requires ready deployed unqueued unembarked unpacked/nonreinforcing attacker, "
                         "the exact native defensible district with remaining HP on enemy-owned territory, "
                         "and native attackable ranged-picker/selected permission. Native hostile garrison/"
                         "retaliation/secondary effects may occur; verifies only attacker attack consumption/"
                         "loss and primary district damage/departure. No damage forecast, city entry/capture, "
                         "destruction claim, naval/air bombardment, war declaration or turn advancement. "
                         "Submits once, polls read-only for 15 seconds, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(bombard_district)
        server.tool(
            name="advance_civ7_unit", title="Advance Civ VII combat unit into enemy field",
            description=("CHANGE GAME STATE: move exact owned ordinary land/sea combat unit_id one adjacent "
                         "step into an empty visible non-district field owned by exact met wartime target_player "
                         "at x/y with fresh expected_turn. Requires ready deployed unqueued unembarked, unpacked "
                         "nonreinforcing source, direct reachable noncombat native path and MOVE_TO/NONE "
                         "permission. No new war, third-party territory, fog, civilians, stacking, district/"
                         "city entry, captures, shore transitions or turn advancement. Existing ordinary move "
                         "tool's own/unowned boundary is unchanged. Verifies exact unit arrival, unembarked "
                         "state and clear queue. Submits once; polls read-only for 15 seconds, never retries "
                         "unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(advance_unit)
        server.tool(
            name="attack_civ7_commander", title="Use Civ VII direct commander attack",
            description=("CHANGE GAME STATE: exact native COMMANDER_ATTACK/Heroic Assault from deployed "
                         "commander_id against exact wartime target_player/target_unit_id at adjacent x/y "
                         "with fresh expected_turn. Requires mobile unqueued unembarked land/sea commander, "
                         "known source packed membership, one visible hostile same-domain combat unit on an "
                         "own/unowned non-district field, and exact native offered/selected ability permission. "
                         "Native eligibility controls promotion/charge prerequisites. No inferred damage, "
                         "civilian/stack/district/city targets, enemy territory, packed-unit attacks, war or "
                         "turn advancement. Verifies commander movement/attack spend plus primary-target "
                         "damage/departure and stable source location/membership; not numeric ability-charge "
                         "accounting, a kill or complete splash proof. Submits once; polls read-only for "
                         "15 seconds and never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(commander_attack)
        server.tool(
            name="edit_civ7_production_queue", title="Edit one Civ VII production queue",
            description=("CHANGE GAME STATE: cancel one queued order or swap two adjacent orders in exact "
                         "owned city settlement. Supply production.queueToken from fresh available-decisions "
                         "readout, action cancel/swap, zero-based index, other_index only for swap, and "
                         "expected_turn. Requires exact whole-queue token match, at most64 entries and native "
                         "BUILD RemoveAt/Swap permission. Rejects stale indices/tokens and confirmations. "
                         "Verifies the complete resulting ordered queue with every other order preserved. "
                         "Cancellation can affect active production or reserved placements; no refund or "
                         "invested-progress retention is promised. No replacement, multi-step reorder, town "
                         "focus change or turn advancement. Submits once; never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(edit_production_queue)
        server.tool(
            name="swap_civ7_resources", title="Swap two assigned Civ VII resources",
            description=("CHANGE GAME STATE: atomically exchange first_resource_instance/first_off_map and "
                         "second_resource_instance/second_off_map with fresh expected_turn. Both exact owned "
                         "resources must be uniquely assigned to different owned settlements; assignments "
                         "must be unlocked and native SWAP_RESOURCES must permit the exact pair. Same-city "
                         "is a no-op; unassigned sources are rejected. Map/off-map identities stay distinct. "
                         "Verifies both exchanged city assignments and complete preservation of every other "
                         "owned resource assignment. No sequential unassign/reassign fallback, bulk clearing "
                         "or turn advancement. Submits once; never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(swap_resources)
        server.tool(
            name="unassign_civ7_resource", title="Unassign one Civ VII resource",
            description=("CHANGE GAME STATE: unassign exact owned resource_instance/off_map identity from "
                         "its exact current source settlement with fresh expected_turn. Requires unlocked "
                         "assignment and native ASSIGN_RESOURCE Deactivate permission. Rejects a different "
                         "source; already unassigned is a no-op. No bulk clearing, factory clearing, swaps "
                         "or turn advancement. Verifies the same resource remains owned and unassigned. "
                         "Submits once; never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(unassign_resource)
        server.tool(
            name="rail_civ7_unit", title="Move ordinary Civ VII unit by rail",
            description=("CHANGE GAME STATE: native MOVE_BY_RAIL for exact owned ordinary land unit_id "
                         "to x/y with fresh expected_turn. Requires mobile deployed unqueued unembarked, "
                         "unpacked/nonreinforcing source, visible owned land endpoints, empty destination "
                         "and exact native offered/selected rail permission. No guessed connection, ordinary "
                         "walk fallback, commander transport, stacking, capture or turn advancement. Verifies "
                         "same unit at exact destination with clear queue; no future-turn arrival claim. "
                         "Submits once, polls read-only for 15 seconds, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(rail_unit)
        server.tool(
            name="upgrade_civ7_army", title="Upgrade all packed Civ VII army members",
            description=("CHANGE GAME STATE: native UPGRADE_ARMY for exact owned deployed commander_id "
                         "with max_gold_cost and fresh expected_turn. Requires a visible owned source tile "
                         "and 1..16 captured packed land/naval combat members, all directly upgradeable. "
                         "Every member's exact native English upgrade target/price must reconcile with the "
                         "exact native English aggregate count/Gold quote, within cap and treasury. Mixed/"
                         "unknown eligibility, unsupported price formats, queues or confirmations are rejected. "
                         "Authorization covers every packed member. Verifies all quoted target types in the "
                         "same army (including native replacement IDs), exact Gold spend, preserved unaffected "
                         "owned inventory/types and other army memberships; duplicate-type replacements are "
                         "verified as a multiset, not individually paired. No purchase, unpack, walking or "
                         "turn advancement. Submits once, polls read-only for 15 seconds and never retries "
                         "unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(upgrade_army)
        server.tool(
            name="rail_civ7_commander", title="Move Civ VII commander by rail",
            description=("CHANGE GAME STATE: move exact owned deployed land commander_id and its captured "
                         "packed army to exact x/y using native MOVE_BY_RAIL with fresh expected_turn. "
                         "Requires mobile unqueued unembarked source, complete known owner-qualified packed "
                         "membership, visible owned land endpoints, an empty destination and exact native "
                         "offered/selected rail permission. Never infers railway connectivity, walks as a "
                         "fallback, attacks or buys a station. Verifies exact commander arrival, unchanged "
                         "packed membership and clear queue. No ordinary-unit rail, naval/air transport, "
                         "foreign/fogged travel, turn advancement or future-turn arrival claim. Submits once, "
                         "polls read-only for 15 seconds and never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(rail_commander)
        server.tool(
            name="naval_attack_civ7_unit", title="Attack Civ VII enemy combat ship",
            description=("CHANGE GAME STATE: one exact native NAVAL_ATTACK by owned unit_id against exact "
                         "wartime target_player/target_unit_id at visible x/y with fresh expected_turn. Both "
                         "must be deployed naval combat ships on water; source must be ready, unqueued, "
                         "unpacked and nonreinforcing. Target must be alone on an own/unowned non-district "
                         "water tile. Requires exact native naval offered-plot and selected-target permission, "
                         "not generic RANGE_ATTACK or guessed range. No civilians, stacks, shore bombardment, "
                         "city/district attacks, enemy territory, war declaration or turn advancement. "
                         "Verifies captured attack consumption/loss plus primary-target damage/departure; "
                         "not kill statistics or complete secondary effects. Submits once, polls read-only "
                         "for 15 seconds and never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(naval_attack_unit)
        server.tool(
            name="rebase_civ7_aircraft", title="Rebase Civ VII aircraft to owned city",
            description=("CHANGE GAME STATE: rebase exact owned deployed aircraft unit_id to exact owned "
                         "target_city_id with fresh expected_turn. Initial scope is a currently visible owned "
                         "city centre offered by native REBASE; native selected-target permission controls "
                         "range/capacity. Requires unqueued nonreinforcing aircraft, deployed or stationed in "
                          "one captured visible owned Aerodrome/squadron/carrier, and complete known own army membership. "
                          "No commander rebasing, carrier/squadron destination (use transfer tool), foreign "
                         "bases, hidden destinations, automatic unpack or turn advancement. Verifies the same "
                         "aircraft arrived or normally stationed in the captured destination Aerodrome, "
                         "with clear queue, stable health, precise source/destination member delta and all "
                         "other captured memberships preserved; not a future-turn or air mission claim. "
                         "Submits once, polls read-only for 15 seconds and never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(rebase_aircraft)
        server.tool(
            name="join_civ7_fleet", title="Add one Civ VII ship to Fleet Commander",
            description=("CHANGE GAME STATE: join exact owned naval combat unit_id to exact deployed "
                         "Fleet Commander commander_id with fresh expected_turn. Requires adjacent/same-tile "
                         "visible water locations, own/unowned commander tile, no queued/reinforcing source, "
                         "known complete own army inventory and exact native offered/selected ADD_TO_ARMY "
                         "permission. No pack-all, civilian ships, land/air units or implicit transfers. "
                         "Verifies this member joined while every other captured army membership is unchanged. "
                         "No turn advancement; submits once, polls read-only for 15 seconds and never retries "
                         "unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(join_fleet)
        server.tool(
            name="leave_civ7_fleet", title="Deploy one Civ VII ship from fleet",
            description=("CHANGE GAME STATE: deploy exact packed naval combat unit_id from exact "
                         "Fleet Commander commander_id to adjacent empty visible own/unowned water x/y "
                         "or its exact origin occupied only by that Fleet Commander "
                         "with fresh expected_turn. Requires known owner-qualified membership, no queued/"
                         "reinforcing source and exact native offered/selected REMOVE_FROM_ARMY permission. "
                         "Verifies exact ship/tile and preservation of every other captured own army member. "
                         "No full-fleet unpack, land/air membership or turn advancement. Submits once, polls "
                         "read-only for 15 seconds and never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(leave_fleet)
        server.tool(
            name="ranged_attack_civ7_enemy_field", title="Fire at Civ VII enemy-owned field unit",
            description=("CHANGE GAME STATE: one ranged attack by exact owned unit_id against exact wartime "
                         "target_player/target_unit_id on visible enemy-owned x/y with fresh expected_turn. "
                         "Separate from the own/unowned-field attack tool. Requires a ready deployed unqueued "
                         "nonreinforcing land/sea noncommander, one visible hostile combat target, a positively "
                         "identified non-centre field whose owning city centre is also visible, no defensible "
                         "district, and exact native ranged-picker/selected-target permission. No third-party "
                         "territory, stacks, civilians, city/district attacks, melee entry/capture, war or turn "
                         "advancement. Native splash may affect additional enemies; only captured attack "
                         "consumption/loss and primary-target damage/departure are verified, not kills or "
                         "complete secondary effects. Submits once; polls read-only for 15 seconds and never "
                         "retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(ranged_attack_enemy_field)
        server.tool(
            name="grant_civ7_second_wind", title="Grant Civ VII Second Wind",
            description=("CHANGE GAME STATE: grant native Second Wind from exact owned commander_id to "
                         "exact owned unit_id with fresh expected_turn. Land only; requires a deployed unqueued "
                         "commander with known packed membership and one deployed unqueued nonreinforcing land "
                         "combat recipient alone on its visible own/unowned tile. Native offered/selected "
                         "command permission controls range, ability and charge eligibility. Consumes the "
                         "commander's native ability charge. Verifies exactly +2 movement/+1 attack to the "
                         "captured recipient, stable health/location and unchanged source packed membership. "
                         "No implicit movement, unpacking or turn advancement. Submits once; polls read-only "
                         "for 15 seconds and never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(grant_second_wind)
        server.tool(
            name="overrun_civ7_unit", title="Overrun one Civ VII enemy with packed army",
            description=("CHANGE GAME STATE: native Overrun from exact commander_id against exact target_player/"
                         "target_unit_id on adjacent x/y with fresh expected_turn. Requires a mobile deployed "
                         "unqueued land commander with verified packed land combat members and one visible "
                         "hostile land combat target on an own/unowned land field. Exact native offered/selected "
                         "Overrun permission alone determines whether the target is weak enough; no odds, "
                         "strength threshold or damage is estimated. No civilians, stacks, districts, foreign "
                         "territory, war declaration, unpacking or turn advancement. May destroy the target. "
                         "Verifies target departure from the still-visible tile, commander arrival/movement "
                         "spend and unchanged packed membership, not independent kill statistics or hidden state. "
                         "Requires authorization for the whole packed-army action; submits once, polls read-only "
                         "for 15 seconds and never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(army_overrun)
        server.tool(
            name="melee_attack_civ7_army", title="Order Civ VII coordinated melee attack",
            description=("CHANGE GAME STATE: native coordinated land melee attack from deployed commander_id "
                         "against exact target_player/target_unit_id at x/y with fresh expected_turn. Requires "
                         "an existing war, one visible hostile land combat unit on an own/unowned land field, "
                         "no district/stack/civilian target, an unpacked unqueued land commander, and ready "
                         "UNIT_CLASS_INFANTRY/CAVALRY participants in native command radius. Every native-reachable "
                         "participant must already be adjacent; approach travel is rejected. Requires exact "
                         "native melee and offered/selected commander-command checks. Engine selects participants; "
                         "authorization covers all eligible nearby Infantry/Cavalry, which may be damaged/lost. "
                         "Verifies captured participant attack consumption/loss plus primary-target effect, "
                         "not a kill or every secondary effect. No war, city capture, future orders or turn "
                         "advancement. Submits once, polls read-only for 15 seconds; never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(army_melee_attack)
        server.tool(
            name="join_civ7_commander", title="Add one Civ VII unit to commander",
            description=("CHANGE GAME STATE: join exact owned packable land unit_id to commander_id with fresh "
                         "expected_turn. Requires a nearby deployed unqueued nonreinforcing unit, one unambiguous "
                         "deployed land commander on a visible own/unowned destination, known complete packed "
                         "membership, native offered plot and exact ADD_TO_ARMY permission. May pack eligible "
                         "civilians if explicitly selected. No pack-all, implicit transfer from another army, "
                         "naval/air join or turn advancement. Verifies this unit joined and every other captured "
                         "army membership is preserved. Requires exact-unit authorization; submits once and "
                         "polls read-only for 15 seconds, never retries unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(join_commander)
        server.tool(
            name="leave_civ7_commander", title="Remove one Civ VII unit from commander",
            description=("CHANGE GAME STATE: deploy exact packed land unit_id from exact commander_id to x/y "
                         "with fresh expected_turn. Requires verified owner-qualified membership, no queued or "
                         "reinforcing source, an adjacent empty visible own/unowned native-offered plot "
                         "or the exact origin occupied only by that commander, and "
                         "exact REMOVE_FROM_ARMY permission. Verifies this unit's deployment at the exact tile "
                         "and complete preservation of all other army memberships. No full-army unpack, "
                         "implicit transfers, foreign destinations or turn advancement. Requires exact-unit "
                         "authorization; submits once, polls read-only for 15 seconds and never retries "
                         "unknown/cancelled outcomes."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(leave_commander)
        server.tool(
            name="ranged_attack_civ7_army", title="Order Civ VII focused land-ranged attack",
            description=("CHANGE GAME STATE: native focused land-ranged fire from deployed commander_id at "
                         "exact visible target_player/target_unit_id on x/y, with fresh expected_turn. Requires "
                         "an existing war, one combat-formation primary target on an own/unowned field, "
                         "no district/stack/civilian primary target, an unpacked unqueued land commander, "
                         "known deployed ready UNIT_CLASS_RANGED participants in its native command radius "
                         "(siege-only units such as Katyusha are not Focus Fire participants), offered "
                         "target and exact selected-command permission. Engine selects participating units; "
                         "authorization covers all eligible nearby ranged units, not a per-unit subset. "
                         "May consume multiple attacks and damage/destroy units; native splash can affect "
                         "adjacent enemies. Verifies at least one captured participant's attack consumption/loss "
                         "plus primary-target damage/departure, not every shot/splash effect or a kill. "
                         "No war, city capture, raw command, unpacking, turn advancement or confirmation bypass. "
                         "Submits once, polls read-only for 15 seconds, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(army_ranged_attack)
        server.tool(
            name="move_civ7_commander", title="Move Civ VII commander and packed army",
            description=("CHANGE GAME STATE: move an owned deployed unqueued commander_id and all its packed "
                         "members to x/y with fresh expected_turn and explicit max_steps (default1, maximum8). "
                         "Requires known owner-qualified army membership, positive movement, a native "
                         "current-turn path with every edge reachable, visible, empty, owned/unowned, "
                         "same land/water terrain and noncombat. Uses fixed MOVE_TO/NONE, not an attack/war "
                         "helper. No shore transitions, foreign territory, occupied tiles, future-turn orders "
                         "or turn advancement. Verifies exact commander position and unchanged packed "
                         "membership. Requires authorization for moving the whole packed army; submits once "
                         "and polls read-only for up to 15 seconds, never retries unknown/cancelled calls."),
            annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
            structured_output=True,
        )(move_commander)
        server.tool(
            name="attack_civ7_unit", title="Attack one visible Civ VII enemy unit",
            description=("CHANGE GAME STATE: one melee/ranged attack by owned deployed unqueued noncommander "
                         "unit_id against explicit target_player/target_unit_id at x/y, with fresh expected_turn. "
                         "Read exact enemy IDs from get_civ7_combat_options.defender. Requires an existing war, "
                         "single currently visible hostile combat unit on an owned/unowned field tile, "
                         "no defensible district/civilian/stack, "
                         "known unpacked/nonreinforcing attacker and native attack permission. Melee is adjacent; "
                         "ranged requires a native attackable picker plot. No war declaration, city capture, "
                         "embarked/air/group attacks or confirmation bypass. Native splash may also damage "
                         "adjacent enemies; readback verifies only the primary-target effect. May damage or destroy either unit "
                         "and consume movement. Verifies consumed attack/attacker loss plus visible target damage "
                         "or departure, not a kill, predicted damage or safe outcome. Requires user authorization; "
                         "submits once, then polls read-only combat evidence for up to 15 seconds; "
                         "never automatically retries unknown/cancelled outcomes."),
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
                         "that whole pack-nearby action; submits once, polls read-only for 15 seconds and never retries unknown/cancelled outcomes."),
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
                         "submits once, polls read-only for 15 seconds and never retries unknown/cancelled calls."),
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
                         "no attacks, travel, disbanding or raw operation strings. A different queued order "
                         "requires explicit cancel/wake first. Verifies native activity/current operation; "
                         "heal also recognizes HOLD with an exact queued REST_UNTIL_HEALED order, "
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
            "to currently visible owned plots, plus native upgradeArmy aggregate count/Gold quote when the "
            "exact English price format is supported; per-member reconciliation remains action-specific. "
            "A selected packable land unit or naval combat ship also reports addToArmy "
            "or removeFromArmy with exact checked nearby-commander or individual deployment options "
            "on empty visible own/unowned leave tiles. Unknown commander membership "
            "stays unknown. Selected deployed land commanders additionally report secondWind native "
            "permission and exact unambiguous checked own land-combat recipient options, plus rail native "
            "permission and exact checked empty visible-owned land destinations. Unknown membership "
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
            "command check requiring this target in native plots. focusedLandRangedAttack also "
            "checks native offered/selected-target Focus Fire permission; this alone does not "
            "prove eligible Ranged-class participants (siege-only Katyusha is excluded by the action). "
            "focusedLandMeleeAttack separately checks coordinated-melee command permission; actual "
            "Infantry/Cavalry participant eligibility and adjacent-only restrictions are enforced by its action. "
            "overrun checks exact native offered/selected Overrun permission without inferring strength odds; "
            "packed-army and field-target restrictions remain action-specific. "
            "Reported modifiers are not "
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
