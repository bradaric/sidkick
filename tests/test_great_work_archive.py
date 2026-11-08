import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class ArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_archive_is_strict_opt_in_and_captures_complete_ledger(self):
        self.assertTrue(callable(getattr(actions,'archive_great_work',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.archive_great_work(6,62)
        self.assertEqual(run.await_args.args,('archive_great_work.js',{'great_work_index':6,'expected_turn':62}))
        self.assertNotIn('archive_civ7_great_work',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('archive_civ7_great_work',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
