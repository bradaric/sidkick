import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

BEFORE = {'turn': 60, 'age': 42, 'playerId': 0}


class CultureCardTests(unittest.IsolatedAsyncioTestCase):
    async def test_card_uses_existing_full_inventory_verifier_and_fixed_script(self):
        self.assertTrue(callable(getattr(actions, 'set_culture_card', None)))
        expected = {'activePolicies': ['CARD_POLICY'], 'activeTraditions': ['CARD_TEST'], 'activeCrises': []}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': BEFORE, 'expected': expected}, {**BEFORE, **expected}]) as run:
            result = await actions.set_culture_card('CARD_TEST', True, 'tradition', 60)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('set_culture_card.js', {
            'card': 'CARD_TEST', 'active': True, 'slot': 'tradition', 'expected_turn': 60}))
        self.assertEqual(run.await_args_list[1].args, ('policy_state.js',))

    async def test_card_tool_is_strict_mutating_and_opt_in(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        self.assertNotIn('set_civ7_culture_card', normal)
        server = create_server(enable_writes=True)
        tools = {t.name: t for t in server._tool_manager.list_tools()}
        self.assertIn('set_civ7_culture_card', tools)
        tool = tools['set_civ7_culture_card']
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters['required']), {'card', 'active', 'slot', 'expected_turn'})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(' ', True, 'tradition', 60), ('CARD_TEST', 1, 'tradition', 60),
                         ('CARD_TEST', True, 'raw', 60), ('CARD_TEST', True, 'tradition', True)]:
                with self.assertRaises(ValueError):
                    await actions.set_culture_card(*args)
            with self.assertRaises(ToolError):
                await server.call_tool('set_civ7_culture_card', {
                    'card': 'CARD_TEST', 'active': 1, 'slot': 'tradition', 'expected_turn': 60})
            run.assert_not_awaited()

    async def test_rejections_noops_and_unknowns_never_resubmit(self):
        self.assertTrue(callable(getattr(actions, 'set_culture_card', None)))
        for status in ('rejected', 'already_active', 'already_inactive'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.set_culture_card('CARD_TEST', True, 'tradition', 60))['status'], status)
                self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.set_culture_card('CARD_TEST', True, 'tradition', 60))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.set_culture_card('CARD_TEST', True, 'tradition', 60)
            self.assertEqual(run.await_count, 1)
