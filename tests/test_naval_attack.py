import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class NavalAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_shore_field_fire_uses_a_fixed_separate_kind(self):
        self.assertTrue(callable(getattr(actions, 'naval_attack_land_unit', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await actions.naval_attack_land_unit(10, 1, 20, 3, 3, 62)
        self.assertEqual(run.await_args.args, ('attack_unit.js', {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20,
            'x': 3, 'y': 3, 'expected_turn': 62, 'kind': 'shore', 'target_territory': 'enemy_field', 'observe_effects': True, 'observation_radius': 1}))
        self.assertNotIn('naval_attack_civ7_land_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('naval_attack_civ7_land_unit', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})

    async def test_naval_attack_submits_once_and_uses_existing_exact_combat_readback(self):
        self.assertTrue(callable(getattr(actions, 'naval_attack_unit', None)))
        args = {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62, 'kind': 'naval',
                'observe_effects': True, 'observation_radius': 1}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 10, 'before_attacks': 1, 'target_unit_id': 20}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'attackObserved': True}, 'verificationArguments': captured},
            {**before, 'attackObserved': True}]) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('attack_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_naval_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('naval_attack_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('naval_attack_civ7_unit', set(enabled))
        self.assertFalse(enabled['naval_attack_civ7_unit'].annotations.read_only_hint)
        self.assertTrue(enabled['naval_attack_civ7_unit'].annotations.destructive_hint)
        self.assertFalse(enabled['naval_attack_civ7_unit'].annotations.idempotent_hint)
        self.assertIn('met peaceful third-party', enabled['naval_attack_civ7_unit'].description)
        self.assertIn('verifies peace', enabled['naval_attack_civ7_unit'].description)
        self.assertIn('enemy-owned', enabled['naval_attack_civ7_unit'].description)
        self.assertIn('city-states and major civilizations', enabled['naval_attack_civ7_unit'].description)
        self.assertNotIn('No civilians, stacks, shore bombardment, city/district attacks, wartime-owned territory',
                         enabled['naval_attack_civ7_unit'].description)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.naval_attack_unit(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('naval_attack_civ7_unit', {
                    'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_naval_unknown_cancelled_rejected_calls_never_repeat(self):
        self.assertTrue(callable(getattr(actions, 'naval_attack_unit', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'rejected'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.naval_attack_unit(10, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)

    async def test_neutral_water_readback_requires_peace_without_resubmitting(self):
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 10, 'before_attacks': 1, 'target_unit_id': 20, 'neutral_territory_owner': 2}
        submitted = {'status': 'submitted', 'before': before, 'verificationArguments': captured,
                     'expected': {'attackObserved': True, 'neutralTerritoryPeacePreserved': True}}
        for preserved in (True, False):
            async def execute(script, arguments):
                if script == 'attack_unit.js':
                    return submitted
                return {**before, 'attackObserved': True, 'neutralTerritoryPeacePreserved': preserved}
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=execute) as run, \
                    patch('civ7.actions._COMBAT_VERIFICATION_TIMEOUT', 0.01):
                result = await actions.naval_attack_unit(10, 1, 20, 3, 3, 62)
            self.assertEqual(result['status'], 'verified_applied' if preserved else 'unknown')
            writes = [call for call in run.await_args_list if call.args[0] == 'attack_unit.js']
            self.assertEqual(len(writes), 1)
            self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))
