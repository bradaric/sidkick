"""On-demand MCP service for Sidkick game adapters."""

import argparse
from base64 import b64encode
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.types import Icon, ToolAnnotations

from civ7.player import snapshot
from civ7.queries import (
    available_decisions,
    building_placements,
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
            "threats are discovered only on tiles visible this turn."
        ),
    )
    server.tool(
        name="get_civ7_player_snapshot",
        title="Get Civ VII player snapshot",
        description=(
            "Read the loaded local player's complete Civilization VII strategy snapshot, "
            "including empire totals, settlements, growth choices, research and government, "
            "religion, Triumphs and Dedications, resources and trade, units, victory progress, "
            "and known-world summary, plus available decisions, major/city-state diplomacy, visible threats, and turn "
            "context. Excludes "
            "the large per-tile explored map and targeted building-placement queries, "
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
        description="Get the local player's treasury, net yields, and settlement limit.",
        annotations=read_only,
        structured_output=True,
    )(empire)
    server.tool(
        name="get_civ7_available_decisions",
        title="Get Civ VII available decisions",
        description=(
            "Get currently available settlement production and purchase choices, costs, "
            "turns, town conversions, and visible unit upgrades."
        ),
        annotations=read_only,
        structured_output=True,
    )(available_decisions)
    server.tool(
        name="get_civ7_settlements",
        title="Get Civ VII settlement details",
        description=(
            "Get the local player's cities and towns, focuses, growth, specialists, "
            "buildings, districts, Great Work slots, yields, and production queues."
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
            "plus government, policies, traditions, crisis cards, and leader attribute "
            "points, purchased/available perks, effects, prerequisites, base costs and wildcard funding."
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
            "Read-only: does not found religions, select beliefs, or convert settlements."
        ),
        annotations=read_only,
        structured_output=True,
    )(religion)
    server.tool(
        name="get_civ7_resources_and_trade",
        title="Get Civ VII resources and trade",
        description=(
            "Get the local player's resources, settlement assignments and free slots, "
            "trade-network state, and active or available known routes."
        ),
        annotations=read_only,
        structured_output=True,
    )(resources_and_trade)
    server.tool(
        name="get_civ7_units",
        title="Get Civ VII units",
        description=(
            "Get only the local player's units, locations, health, movement, experience, "
            "promotions, and commander packing state."
        ),
        annotations=read_only,
        structured_output=True,
    )(units)
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
            "and progress for the local player and met major players only."
        ),
        annotations=read_only,
        structured_output=True,
    )(victory_progress)
    server.tool(
        name="get_civ7_diplomacy",
        title="Get Civ VII diplomacy",
        description=(
            "Get relationships, modifiers, deals, ongoing projects, and available "
            "diplomatic actions involving met major players only."
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
            "for the local player."
        ),
        annotations=read_only,
        structured_output=True,
    )(turn_context)
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

