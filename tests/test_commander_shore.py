import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CommanderShoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_packed_shore_is_separate_fixed_opt_in_movement(self):
        self.assertTrue(callable(getattr(actions,'cross_commander_shore',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.cross_commander_shore(10,3,3,62)
        self.assertEqual(run.await_args.args,('commander_action.js',{'commander_id':10,'x':3,'y':3,'expected_turn':62,'mode':'shore'}))
        self.assertNotIn('cross_civ7_commander_shore',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('cross_civ7_commander_shore',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
