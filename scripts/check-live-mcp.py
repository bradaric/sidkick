"""Run harmless end-to-end MCP discovery and read-only query checks."""

import asyncio
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


ROOT = Path(__file__).resolve().parents[1]


async def main() -> None:
    parameters = StdioServerParameters(
        command=sys.executable,
        args=["-m", "sidkick.server", "--transport", "stdio"],
        cwd=ROOT,
    )
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            if not initialized.server_info.icons:
                raise RuntimeError("Sidkick did not advertise its icon")
            tools = await session.list_tools()
            for tool in tools.tools:
                arguments = {}
                if tool.name == "get_civ7_peace_city_offer":
                    decisions = await session.call_tool("get_civ7_available_decisions", {})
                    diplomacy = await session.call_tool("get_civ7_diplomacy", {})
                    cities = (decisions.structured_content or {}).get("settlements", [])
                    peers = (diplomacy.structured_content or {}).get("majorPlayers", [])
                    if decisions.is_error or diplomacy.is_error or not cities or not peers:
                        raise RuntimeError("An owned city and met major are required for targeted peace-city evidence")
                    city = cities[0]
                    arguments = {"target_player_id": peers[0]["playerId"], "city_owner": city["cityOwner"],
                                 "city_id": city["cityId"], **city["location"]}
                if tool.name == "get_civ7_building_placements":
                    details = await session.call_tool("get_civ7_settlements", {})
                    if details.is_error:
                        raise RuntimeError("Could not read settlements for placement query")
                    settlements = (details.structured_content or {}).get("settlements", [])
                    if not settlements:
                        raise RuntimeError("A settlement is required to check building placements")
                    arguments = {"settlement": settlements[0]["name"]}
                if tool.name in {"get_civ7_movement_and_founding", "get_civ7_combat_options"}:
                    details = await session.call_tool("get_civ7_units", {})
                    if details.is_error:
                        raise RuntimeError("Could not read units for targeted unit query")
                    units = (details.structured_content or {}).get("units", [])
                    if not units:
                        raise RuntimeError("An owned unit is required for targeted unit queries")
                    arguments = {"unit_id": units[0]["instanceId"]}
                    if tool.name == "get_civ7_combat_options":
                        deployed = next((unit for unit in units if unit.get("location")), None)
                        if deployed is None:
                            raise RuntimeError("A deployed owned unit is required to check combat evidence")
                        arguments = {"unit_id": deployed["instanceId"], **deployed["location"]}
                result = await session.call_tool(tool.name, arguments)
                if result.is_error:
                    raise RuntimeError(f"{tool.name} returned an MCP error")
                if tool.name == "get_civ7_player_snapshot":
                    status = (result.structured_content or {}).get("snapshotStatus")
                    if (
                        not isinstance(status, dict) or status.get("status") != "complete"
                        or status.get("complete") is not True or status.get("consistent") is not True
                    ):
                        raise RuntimeError(f"Player snapshot failed reliability checks: {status}")
            print(
                f"MCP {initialized.protocol_version}: "
                f"{len(tools.tools)} tools discovered and called successfully"
            )


if __name__ == "__main__":
    asyncio.run(main())
