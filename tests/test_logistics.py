import unittest
from unittest.mock import AsyncMock, patch

from civ7 import queries
from sidkick.server import create_server


class LogisticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_bundled_inventory_and_targeted_queries(self):
        self.assertTrue(callable(getattr(queries, "military_logistics", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"commanders": []}) as run:
            await queries.military_logistics()
            run.assert_awaited_with("logistics.js", {"unit_id": None})
            await queries.military_logistics(2)
            run.assert_awaited_with("logistics.js", {"unit_id": 2})
            for value in (True, -1, "2", 1.5):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    await queries.military_logistics(value)

    async def test_read_only_mcp_tool_preserves_structured_data(self):
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertIn("get_civ7_military_logistics", tools)
        self.assertTrue(tools["get_civ7_military_logistics"].annotations.read_only_hint)
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"commanders": []}) as run:
            result = await server.call_tool("get_civ7_military_logistics", {"unit_id": 2})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {"commanders": []})
        run.assert_awaited_once_with("logistics.js", {"unit_id": 2})
