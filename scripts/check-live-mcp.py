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
            tools = await session.list_tools()
            for tool in tools.tools:
                result = await session.call_tool(tool.name, {})
                if result.is_error:
                    raise RuntimeError(f"{tool.name} returned an MCP error")
            print(
                f"MCP {initialized.protocol_version}: "
                f"{len(tools.tools)} tools discovered and called successfully"
            )


if __name__ == "__main__":
    asyncio.run(main())
