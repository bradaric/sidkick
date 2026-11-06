import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class AllianceTests(unittest.IsolatedAsyncioTestCase):
    async def test_alliance_is_fixed_native_form_or_cancel_not_arbitrary_diplomacy(self):
        self.assertTrue(callable(getattr(actions,'manage_alliance',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.manage_alliance(3,'form',62)
        self.assertEqual(run.await_args.args,('alliance_action.js',{'target_player_id':3,'action':'form','expected_turn':62}))
        with self.assertRaises(ValueError):await actions.manage_alliance(3,'force',62)
        self.assertNotIn('manage_civ7_alliance',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('manage_civ7_alliance',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
