"""On-demand MCP service for Sidkick game adapters."""

import argparse

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

from civ7.player import snapshot


def create_server() -> MCPServer:
    server = MCPServer(
        "Sidkick",
        instructions=(
            "Read-only game snapshots for strategy advice. Call the Civilization VII "
            "snapshot only when current game data is needed."
        ),
    )
    server.tool(
        name="get_civ7_player_snapshot",
        title="Get Civ VII player snapshot",
        description=(
            "Read the loaded local player's current Civilization VII strategy data. "
            "Returns only that player's identity, turn, Age, settlements, yields, "
            "research, production queues, Triumph progress, and Dedication choices."
        ),
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
        structured_output=True,
    )(snapshot)
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

