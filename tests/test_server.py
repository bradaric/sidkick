import unittest

from civ7.connection import run_script
from sidkick.server import create_server


class ServerTests(unittest.TestCase):
    def test_registers_focused_read_only_tools(self) -> None:
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertEqual(
            set(tools),
            {
                "get_civ7_player_snapshot",
                "get_civ7_empire",
                "get_civ7_settlements",
                "get_civ7_research_and_government",
                "get_civ7_resources_and_trade",
                "get_civ7_units",
                "get_civ7_known_world",
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


if __name__ == "__main__":
    unittest.main()
