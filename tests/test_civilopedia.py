import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import queries
from sidkick.server import create_server


class CivilopediaTests(unittest.IsolatedAsyncioTestCase):
    async def test_query_and_default_mcp_tool_are_read_only_and_bounded(self):
        self.assertTrue(callable(getattr(queries, 'civilopedia', None)))
        arguments = {'query': 'Explorer', 'section_id': None, 'page_id': None, 'limit': 10, 'offset': 0}
        with patch('civ7.queries.run_script', new_callable=AsyncMock, return_value={'mode': 'search'}) as run:
            result = await create_server().call_tool('get_civ7_civilopedia', {'query': 'Explorer'})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {'mode': 'search'})
        run.assert_awaited_once_with('civilopedia.js', arguments)
        for enabled in (False, True):
            tool = next(tool for tool in create_server(enable_writes=enabled)._tool_manager.list_tools()
                        if tool.name == 'get_civ7_civilopedia')
            self.assertTrue(tool.annotations.read_only_hint)
            self.assertFalse(tool.annotations.destructive_hint)

    async def test_invalid_selectors_and_unbounded_or_coerced_inputs_never_reach_game(self):
        self.assertTrue(callable(getattr(queries, 'civilopedia', None)))
        for args in ({'query': ' '}, {'page_id': 'UNIT_EXPLORER'}, {'query': 'Explorer', 'section_id': 'UNITS', 'page_id': 'UNIT_EXPLORER'},
                     {'limit': 0}, {'limit': 21}, {'offset': -1}, {'offset': True}, {'query': 'x' * 201}):
            with self.subTest(arguments=args), patch('civ7.queries.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await queries.civilopedia(**args)
                run.assert_not_awaited()
        with patch('civ7.queries.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server().call_tool('get_civ7_civilopedia', {'limit': True})
            run.assert_not_awaited()
