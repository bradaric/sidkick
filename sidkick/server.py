"""On-demand MCP service for Sidkick game adapters."""

import argparse
from base64 import b64encode
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.types import Icon, ToolAnnotations

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


def create_server() -> MCPServer:
    server = MCPServer(
        "Sidkick",
        title="Sidkick",
        description="Live, read-only game data for strategy advice.",
        icons=[server_icon()],
        instructions=(
            "Read-only, local-player Civilization VII data for strategy advice. Use "
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
            "Great-Work relocation queries and the map-scanning archaeology query, "
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
            "maintenance and unattributed base income; missing sources are null, not zero."
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
            "operation readiness and native charges remaining; arbitrary target conversion "
            "previews remain unknown. Packed units are not queried as deployed missionaries. "
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
            "gains; swaps and net yield changes remain unknown. Never selects, moves or archives "
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
            "Includes unowned promotion/commendation choices, effects, prerequisite ownership, "
            "picker eligibility and native operation checks; prerequisite logic is not inferred."
        ),
        annotations=read_only,
        structured_output=True,
    )(units)
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
            "terrain, features, and resources already revealed to the local player."
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
            "completion timing, not guaranteed agreement expiry dates. Safe secondaryTargets "
            "include met/local players, owned settlements, public unit types and offered amounts, "
            "with exact selected-argument permission checks and failure reasons. Other target "
            "types/foreign settlements are omitted, so lists are partial and total costs remain "
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
    args = parser.parse_args()

    server = create_server()
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
