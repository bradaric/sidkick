import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import queries
from sidkick.server import create_server


class AsciiMapTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_tool_is_read_only_with_a_single_bounded_query(self):
        for enabled in (False, True):
            tool = next(tool for tool in create_server(enable_writes=enabled)._tool_manager.list_tools()
                        if tool.name == 'get_civ7_ascii_map')
            self.assertTrue(tool.annotations.read_only_hint)
            self.assertFalse(tool.annotations.destructive_hint)
            self.assertEqual(set(tool.parameters['required']), {'x', 'y'})
        with patch('civ7.queries.run_script', new_callable=AsyncMock, return_value={'ascii': 'fixture'}) as run:
            result = await create_server().call_tool('get_civ7_ascii_map', {'x': 20, 'y': 10})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {'ascii': 'fixture'})
        run.assert_awaited_once_with('ascii_map.js', {'x': 20, 'y': 10, 'width': 15, 'height': 9})

    async def test_custom_viewport_and_invalid_inputs(self):
        with patch('civ7.queries.run_script', new_callable=AsyncMock, return_value={}) as run:
            await queries.ascii_map(0, 0, 31, 21)
        run.assert_awaited_once_with('ascii_map.js', {'x': 0, 'y': 0, 'width': 31, 'height': 21})
        for args in [(True, 0), (0, -1), ('2', 0), (0, 0, 4), (0, 0, 33), (0, 0, 3, 23), (0, 0, 3, True)]:
            with patch('civ7.queries.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await queries.ascii_map(*args)
                run.assert_not_awaited()
        with patch('civ7.queries.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server().call_tool('get_civ7_ascii_map', {'x': True, 'y': 0})
            run.assert_not_awaited()
