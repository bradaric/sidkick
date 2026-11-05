import unittest
from unittest.mock import AsyncMock, patch

from civ7 import queries
from sidkick.server import create_server


class GreatWorkTests(unittest.IsolatedAsyncioTestCase):
    async def test_inventory_and_targeted_queries_use_validated_json_arguments(self):
        self.assertTrue(callable(getattr(queries, "great_works", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"works": []}) as run:
            await queries.great_works()
            run.assert_awaited_with("great_works.js", {"great_work_index": None})
            await queries.great_works(7)
            run.assert_awaited_with("great_works.js", {"great_work_index": 7})
        with patch("civ7.queries.run_script", new_callable=AsyncMock) as run:
            for value in [True, -1, 1.5, "7"]:
                with self.subTest(value=value), self.assertRaises(ValueError):
                    await queries.great_works(value)
            run.assert_not_awaited()

    async def test_mcp_registers_optional_read_only_inventory_and_relocation_query(self):
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertIn("get_civ7_great_works", tools)
        self.assertTrue(tools["get_civ7_great_works"].annotations.read_only_hint)
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"works": []}) as run:
            result = await server.call_tool("get_civ7_great_works", {"great_work_index": 7})
        self.assertFalse(result.is_error)
        run.assert_awaited_once_with("great_works.js", {"great_work_index": 7})
