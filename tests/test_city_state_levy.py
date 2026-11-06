import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class LevyTests(unittest.IsolatedAsyncioTestCase):
    async def test_levy_verifies_immediate_receipt_instead_of_event_persistence(self):
        before={'turn':62,'age':42,'playerId':0};captured={'target_player_id':7,'expected_unit_type':100}
        with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[{'status':'submitted','before':before,'expected':{'levyObserved':True},'verificationArguments':captured},{**before,'levyObserved':True}])as run:
            self.assertEqual((await actions.levy_city_state_unit(7,55,'UNIT_SCOUT',60.0,62))['status'],'verified_applied')
        self.assertEqual(run.await_args.args,('city_state_levy_state.js',captured))

    async def test_levy_binds_exact_offered_unit_without_foreign_unit_reads(self):
        self.assertTrue(callable(getattr(actions,'levy_city_state_unit',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.levy_city_state_unit(7,55,'UNIT_SCOUT',60.0,62)
        self.assertEqual(run.await_args.args,('start_diplomatic_project.js',{'target_kind':'city-state','target_player_id':7,'target_unit_id':55,'unit_type':'UNIT_SCOUT','action':'DIPLOMACY_ACTION_CS_LEVY_UNIT','max_influence_cost':60.0,'expected_turn':62}))
        self.assertNotIn('levy_civ7_city_state_unit',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('levy_civ7_city_state_unit',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
