import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class ObservedAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_ordinary_single_unit_attacks_enable_bounded_native_kill_observation(self):
        cases = [
            ('attack_unit', (10, 1, 20, 3, 3, 'melee', 62), {'kind': 'melee'}),
            ('attack_unit', (10, 1, 20, 3, 3, 'ranged', 62), {'kind': 'ranged'}),
            ('melee_attack_enemy_field', (10, 1, 20, 3, 3, 62), {'kind': 'melee', 'target_territory': 'enemy_field'}),
            ('ranged_attack_enemy_field', (10, 1, 20, 3, 3, 62), {'kind': 'ranged', 'target_territory': 'enemy_field'}),
            ('naval_attack_unit', (10, 1, 20, 3, 3, 62), {'kind': 'naval'}),
            ('naval_attack_land_unit', (10, 1, 20, 3, 3, 62), {'kind': 'shore', 'target_territory': 'enemy_field'}),
        ]
        for name, args, mode in cases:
            with self.subTest(action=name, mode=mode):
                with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                    await getattr(actions, name)(*args)
                run.assert_awaited_once_with('attack_unit.js', {
                    'unit_id': 10, 'target_player': 1, 'target_unit_id': 20,
                    'x': 3, 'y': 3, 'expected_turn': 62, **mode,
                    'observe_effects': True, 'observation_radius': 1,
                })

    async def test_ordinary_attack_waits_for_observation_and_returns_native_kill_evidence(self):
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'observation_token': 'captured-token'}
        for kill in (True, None):
            with self.subTest(killConfirmed=kill):
                after = {**before, 'attackObserved': True, 'observationQuiescent': True,
                         'targetLeftTile': True, 'killConfirmed': kill}
                with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                    {'status': 'submitted', 'before': before,
                     'expected': {'attackObserved': True, 'observationQuiescent': True},
                     'verificationArguments': captured},
                    {**after, 'observationQuiescent': False, 'killConfirmed': None}, after,
                ]) as run, patch('civ7.actions._VERIFICATION_INTERVAL', 0):
                    result = await actions.attack_unit(10, 1, 20, 3, 3, 'ranged', 62)
                self.assertEqual(result['status'], 'verified_applied')
                self.assertIs(result['after']['killConfirmed'], kill)
                self.assertIs(run.await_args_list[0].args[1].get('observe_effects'), True)
                self.assertEqual([call.args[0] for call in run.await_args_list],
                                 ['attack_unit.js', 'unit_attack_state.js', 'unit_attack_state.js'])
                self.assertEqual(run.await_args_list[1].args[1], captured)
                self.assertEqual(run.await_args_list[2].args[1], captured)

    async def test_observed_field_attack_uses_same_fixed_attack_with_bounded_evidence_capture(self):
        self.assertTrue(callable(getattr(actions,'observed_field_attack',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.observed_field_attack(10,1,20,3,3,'melee',62,1)
        self.assertEqual(run.await_args.args,('attack_unit.js',{'unit_id':10,'target_player':1,'target_unit_id':20,'x':3,'y':3,'kind':'melee','expected_turn':62,'observe_effects':True,'observation_radius':1}))
        with self.assertRaises(ValueError):await actions.observed_field_attack(10,1,20,3,3,'melee',62,4)
        self.assertNotIn('observe_civ7_field_attack',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('observe_civ7_field_attack',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
