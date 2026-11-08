import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class ResettleTests(unittest.IsolatedAsyncioTestCase):
    async def test_resettle_is_exact_target_strict_opt_in(self):
        self.assertTrue(callable(getattr(actions,'resettle_migrant',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.resettle_migrant(10,3,3,'IMPROVEMENT_TEST',62)
        self.assertEqual(run.await_args.args,('resettle_migrant.js',{'unit_id':10,'x':3,'y':3,'improvement':'IMPROVEMENT_TEST','expected_turn':62}))
        self.assertNotIn('resettle_civ7_migrant',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('resettle_civ7_migrant',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
