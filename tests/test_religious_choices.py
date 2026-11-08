import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

class ReligiousChoiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_religious_state_diagnostics_reach_mcp_without_submission_retry(self):
        rejection = {'status': 'rejected', 'invalidFields': ['beliefsEarned'],
                     'reason': 'Owned religious state is unverified: beliefsEarned; no action submitted'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value=rejection) as run:
            result = await create_server(enable_writes=True).call_tool('choose_civ7_religious_action', {
                'kind': 'found', 'choice': 'RELIGION_CUSTOM_5', 'custom_name': 'Butterfly Effect', 'expected_turn': 15})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, rejection)
        self.assertEqual(run.await_count, 1)

    async def test_custom_name_is_explicit_and_forwarded_only_for_founding(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await actions.choose_religious_action('found', 'RELIGION_CUSTOM_5', 62, custom_name='Butterfly Effect')
        self.assertEqual(run.await_args.args, ('religious_choice.js', {
            'kind': 'found', 'choice': 'RELIGION_CUSTOM_5', 'expected_turn': 62, 'custom_name': 'Butterfly Effect'}))
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for name in ('', '   ', 'a' * 17, '🦋' * 9, 'bad|name', 'bad<name', 'bad>name',
                         'bad[name', 'bad]name', 'bad\nname', 'bad\x00name', '\ud800', True, 12):
                with self.assertRaises(ValueError):
                    await actions.choose_religious_action('found', 'RELIGION_CUSTOM_5', 62, custom_name=name)
            for kind in ('pantheon', 'belief'):
                with self.assertRaises(ValueError):
                    await actions.choose_religious_action(kind, 'EXACT_ID', 62, custom_name='Butterfly Effect')
            run.assert_not_awaited()

    async def test_custom_founding_schema_is_strict_opt_in_and_uncertain_submission_is_not_retried(self):
        arguments = {'kind': 'found', 'choice': 'RELIGION_CUSTOM_5', 'expected_turn': 62, 'custom_name': 'Butterfly Effect'}
        server = create_server(enable_writes=True)
        tool = server._tool_manager.get_tool('choose_civ7_religious_action')
        self.assertIn('custom_name', tool.parameters['properties'])
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            result = await server.call_tool('choose_civ7_religious_action', arguments)
        self.assertEqual(result.structured_content['status'], 'unknown')
        self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await server.call_tool('choose_civ7_religious_action', {**arguments, 'custom_name': True})
            run.assert_not_awaited()

    async def test_custom_founding_uses_captured_name_readback_and_never_resubmits_a_mismatch(self):
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'kind': 'found', 'expected_pantheons': [], 'expected_beliefs': [],
                    'expected_religion': 'RELIGION_CUSTOM_5', 'expected_founded': True,
                    'expected_custom_name': 'Butterfly Effect'}
        for observed, status in ((True, 'verified_applied'), (False, 'unknown')):
            async def response(script, arguments):
                if script == 'religious_choice.js':
                    return {'status': 'submitted', 'before': before,
                            'expected': {'choiceObserved': True}, 'verificationArguments': captured}
                return {**before, 'choiceObserved': observed,
                        'religionName': 'Butterfly Effect' if observed else 'Wrong name'}
            with patch('civ7.actions._VERIFICATION_TIMEOUT', 0.01), patch(
                    'civ7.actions.run_script', side_effect=response) as run:
                result = await actions.choose_religious_action('found', 'RELIGION_CUSTOM_5', 62,
                                                              custom_name='Butterfly Effect')
            self.assertEqual(result['status'], status)
            self.assertEqual([call.args[0] for call in run.await_args_list],
                             ['religious_choice.js', 'religious_choice_state.js'])
            self.assertEqual(run.await_args_list[1].args[1], captured)

    async def test_fixed_religious_actions_are_opt_in_strict_and_never_retried(self):
        self.assertTrue(callable(getattr(actions, 'choose_religious_action', None)))
        for kind in ('pantheon', 'belief', 'found'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                await actions.choose_religious_action(kind, 'EXACT_ID', 62)
            self.assertEqual(run.await_args.args, ('religious_choice.js', {'kind': kind, 'choice': 'EXACT_ID', 'expected_turn': 62}))
        self.assertNotIn('choose_civ7_religious_action', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('choose_civ7_religious_action', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.choose_religious_action('raw', 'X', 62)
            with self.assertRaises(ValueError): await actions.choose_religious_action('belief', 'X', True)
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.choose_religious_action('belief', 'X', 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.choose_religious_action('belief', 'X', 62)
            self.assertEqual(run.await_count, 1)
