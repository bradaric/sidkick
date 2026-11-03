from contextlib import ExitStack
import unittest
from unittest.mock import AsyncMock, patch

from civ7.connection import run_script
from civ7 import queries
from civ7.player import snapshot
from sidkick.server import create_server, server_icon


class ServerTests(unittest.TestCase):
    def test_advertises_embedded_png_icon(self) -> None:
        icon = server_icon()
        self.assertEqual(icon.mime_type, "image/png")
        self.assertEqual(icon.sizes, ["256x256"])
        self.assertTrue(icon.src.startswith("data:image/png;base64,"))

    def test_registers_focused_read_only_tools(self) -> None:
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertEqual(
            set(tools),
            {
                "get_civ7_player_snapshot",
                "get_civ7_empire",
                "get_civ7_available_decisions",
                "get_civ7_settlements",
                "get_civ7_growth",
                "get_civ7_research_and_government",
                "get_civ7_resources_and_trade",
                "get_civ7_units",
                "get_civ7_known_world",
                "get_civ7_victory_progress",
                "get_civ7_diplomacy",
                "get_civ7_visible_threats",
                "get_civ7_turn_context",
                "get_civ7_explored_map",
            },
        )
        for tool in tools.values():
            self.assertTrue(tool.annotations.read_only_hint)
            self.assertFalse(tool.annotations.destructive_hint)
            self.assertFalse(tool.annotations.open_world_hint)


class ConnectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unbundled_script_paths(self) -> None:
        with self.assertRaises(ValueError):
            await run_script("../outside.js")


class GrowthTests(unittest.IsolatedAsyncioTestCase):
    async def test_growth_tool_returns_structured_data(self) -> None:
        data = {"turn": 67, "settlements": []}
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value=data) as run:
            result = await create_server().call_tool("get_civ7_growth", {})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, data)
        run.assert_awaited_once_with("growth.js")

    async def test_runs_bundled_growth_query(self) -> None:
        self.assertTrue(callable(getattr(queries, "growth", None)))
        data = {"turn": 67, "settlements": []}
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value=data) as run:
            self.assertEqual(await queries.growth(), data)
        run.assert_awaited_once_with("growth.js")

    async def test_includes_growth_in_snapshot(self) -> None:
        data = {"turn": 67, "settlements": []}
        names = (
            "run_script", "empire", "settlements", "research_and_government",
            "resources_and_trade", "units", "known_world", "victory_progress",
            "available_decisions", "diplomacy", "visible_threats", "turn_context",
        )
        with ExitStack() as stack:
            for name in names:
                stack.enter_context(patch(
                    f"civ7.player.{name}", new_callable=AsyncMock,
                    return_value={"settlements": [], "archivedGreatWorks": [], "units": []},
                ))
            growth = stack.enter_context(patch(
                "civ7.player.growth", new_callable=AsyncMock, return_value=data,
            ))
            self.assertEqual((await snapshot()).get("growth"), data)
            growth.assert_awaited_once_with()


if __name__ == "__main__":
    unittest.main()
