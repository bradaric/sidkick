import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class HostileDiplomacyTests(unittest.IsolatedAsyncioTestCase):
    async def test_hostile_and_declaration_actions_use_fixed_scripts_and_opt_in_tools(self):
        self.assertTrue(callable(getattr(actions,'start_hostile_diplomatic_project',None)))
        self.assertTrue(callable(getattr(actions,'declare_war',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.start_hostile_diplomatic_project(3,'DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH',150.0,62)
        self.assertEqual(run.await_args.args,('start_diplomatic_project.js',{'target_kind':'hostile','target_player_id':3,'action':'DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH','max_influence_cost':150.0,'expected_turn':62}))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.declare_war(3,'formal',62)
        self.assertEqual(run.await_args.args,('declare_war.js',{'target_player_id':3,'war_type':'formal','expected_turn':62}))
        with self.assertRaises(ValueError):await actions.declare_war(3,'raw',62)
        for name in ('start_civ7_hostile_diplomatic_project','declare_civ7_war'):
            self.assertNotIn(name,{t.name for t in create_server()._tool_manager.list_tools()})
            self.assertIn(name,{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
