import unittest
from unittest.mock import AsyncMock, patch

from civ7 import queries
from sidkick.server import create_server


class ArchaeologyTests(unittest.IsolatedAsyncioTestCase):
    async def test_reads_bundled_archaeology_query(self):
        self.assertTrue(callable(getattr(queries, "archaeology", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"sites": []}) as run:
            self.assertEqual(await queries.archaeology(), {"sites": []})
        run.assert_awaited_once_with("archaeology.js")

    async def test_mcp_registers_read_only_structured_archaeology_tool(self):
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertIn("get_civ7_archaeology", tools)
        self.assertTrue(tools["get_civ7_archaeology"].annotations.read_only_hint)
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"sites": []}) as run:
            result = await server.call_tool("get_civ7_archaeology", {})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {"sites": []})
        run.assert_awaited_once_with("archaeology.js")
