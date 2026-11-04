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
                if tool.name == "get_civ7_building_placements":
                    details = await session.call_tool("get_civ7_settlements", {})
                    if details.is_error:
                        raise RuntimeError("Could not read settlements for placement query")
                    settlements = (details.structured_content or {}).get("settlements", [])
                    if not settlements:
                        raise RuntimeError("A settlement is required to check building placements")
                    arguments = {"settlement": settlements[0]["name"]}
                result = await session.call_tool(tool.name, arguments)
                if result.is_error:
                    raise RuntimeError(f"{tool.name} returned an MCP error")
            print(
                f"MCP {initialized.protocol_version}: "
                f"{len(tools.tools)} tools discovered and called successfully"
            )


if __name__ == "__main__":
    asyncio.run(main())
