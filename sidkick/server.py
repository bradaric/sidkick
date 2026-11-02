"""On-demand MCP service for Sidkick game adapters."""

import argparse

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from civ7.player import snapshot


def create_server(host: str = "127.0.0.1", port: int = 8765) -> FastMCP:
    server = FastMCP(
        "Sidkick",
        instructions=(
            "Read-only game snapshots for strategy advice. Call the Civilization VII "
            "snapshot only when current game data is needed."
        ),
        host=host,
        port=port,
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
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

    create_server(args.host, args.port).run(transport=args.transport)


if __name__ == "__main__":
    main()

