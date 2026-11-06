import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CommanderGreatPersonTests(unittest.IsolatedAsyncioTestCase):
    async def test_villa_ability_profile_is_explicit_not_a_combat_gold_payout_claim(self):
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.activate_commander_great_person(10,30,62,effect='combat_gold')
        self.assertEqual(run.await_args.args[1]['effect'],'combat_gold')

    async def test_morelos_heal_profile_is_explicit_not_inferred_from_source_or_general_end_turn_healing(self):
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.activate_commander_great_person(10,30,62,effect='heal')
        self.assertEqual(run.await_args.args[1],{'unit_id':10,'commander_id':30,'expected_turn':62,'effect':'heal'})
        with self.assertRaises(ValueError):await actions.activate_commander_great_person(10,30,62,effect='anything')

    async def test_concrete_great_person_effect_is_separate_exact_target_intent(self):
        self.assertTrue(callable(getattr(actions,'activate_commander_great_person',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.activate_commander_great_person(10,30,62)
        self.assertEqual(run.await_args.args,('activate_commander_great_person.js',{'unit_id':10,'commander_id':30,'expected_turn':62}))
        with self.assertRaises(ValueError):await actions.activate_commander_great_person(10,10,62)
        self.assertNotIn('activate_civ7_commander_great_person',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('activate_civ7_commander_great_person',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
