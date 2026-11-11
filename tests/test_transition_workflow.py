import asyncio
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from civ7 import actions, connection, queries
from sidkick.server import create_server


class TransitionWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_transport_binds_workflow_helpers_in_their_dependency_scope(self):
        if not shutil.which('node'):
            self.skipTest('Node required to execute transport envelope')
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as temp:
            root = Path(temp)
            for name, text in {
                'transition_workflow_state.js': '(() => transitionWorkflow.snapshot())()',
                'remaining_moves.js': '(() => 1)',
                'dedication_deck.js': '({snapshot: () => 2})',
                'transition_civilization.js': '({snapshot: () => 3})',
                'transition_workflow.js': '({snapshot: () => ({moves: remainingMoves(), deck: dedicationDeck.snapshot(), civ: transitionCivilization.snapshot()})})',
            }.items():
                (root / name).write_text(text)
            reader = asyncio.StreamReader()
            payload = b'SIDKICK_RESULT:{"stubbed":true}\0'
            reader.feed_data(struct.pack('<II', len(payload), 3) + payload)
            writer = Mock(drain=AsyncMock(), wait_closed=AsyncMock())
            with patch('civ7.connection.ROOT', root), patch('civ7.connection.asyncio.open_connection',
                    new_callable=AsyncMock, return_value=(reader, writer)):
                await connection.run_script('transition_workflow_state.js')
            script = writer.write.call_args.args[0][8:].decode().removeprefix('CMD:65535:').removesuffix('\0')
            result = subprocess.run(['node', '-e', "const vm=require('node:vm');console.log(vm.runInNewContext(JSON.parse(process.argv[1])));", json.dumps(script)],
                                    check=True, text=True, capture_output=True, timeout=10)
            self.assertEqual(result.stdout.strip(), 'SIDKICK_RESULT:{"moves":1,"deck":2,"civ":3}')

    async def test_workflow_query_and_actions_are_registered_with_separate_write_opt_in(self):
        self.assertTrue(callable(getattr(queries, 'transition_workflow', None)))
        with patch('civ7.queries.run_transition_loading_script', new_callable=AsyncMock, return_value={'phase': 'started'}), \
                patch('civ7.queries.run_transition_started_script', new_callable=AsyncMock, return_value={'phase': 'choices'}) as run:
            self.assertEqual(await queries.transition_workflow(), {'phase': 'choices'})
        run.assert_awaited_once_with('transition_workflow_state.js')
        normal = {t.name: t for t in create_server()._tool_manager.list_tools()}
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertTrue(normal['get_civ7_transition_workflow'].annotations.read_only_hint)
        for name in ('open_civ7_transition', 'view_civ7_transition_map', 'select_civ7_transition_memento',
                     'confirm_civ7_transition_choices', 'advance_civ7_age_transition', 'begin_civ7_transition_age',
                     'apply_civ7_dedication_effect', 'place_civ7_dedication_effect', 'select_civ7_transition_capital', 'complete_civ7_dedications'):
            self.assertNotIn(name, normal)
            self.assertFalse(enabled[name].annotations.read_only_hint)

    async def test_loading_query_never_initializes_gameplay_helpers_or_profile_metadata(self):
        self.assertTrue(callable(getattr(queries, 'transition_workflow', None)))
        for state in ({'phase': 'loading'}, {'phase': 'awaiting_begin', 'loadingToken': 'ready'},
                      {'phase': 'awaiting_welcome', 'loadingToken': 'welcome'}):
            with patch('civ7.queries.run_transition_loading_script', new_callable=AsyncMock, return_value=state), \
                    patch('civ7.queries.run_transition_started_script', new_callable=AsyncMock) as run:
                self.assertEqual(await queries.transition_workflow(), state)
            run.assert_not_awaited()

    async def test_simple_actions_reuse_serialized_verification(self):
        self.assertTrue(callable(getattr(actions, 'select_transition_memento', None)))
        before = {'turn': 125, 'age': 1, 'playerId': 0}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'mementoSelections': ['M_B']}},
            {**before, 'mementoSelections': ['M_B']},
        ]) as run:
            result = await actions.select_transition_memento('AgeTransitionPlayerMementoMajorSlot', 'M_B', 'token', 125)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(run.await_count, 2)

    async def test_boundary_confirmation_is_not_misreported_as_completed_loading(self):
        self.assertTrue(callable(getattr(actions, 'confirm_transition_choices', None)))
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'ageType': 'AGE_EXPLORATION',
                  'nextAge': 'AGE_MODERN', 'civilization': 'CIVILIZATION_PRUSSIA', 'previousAgeCount': 1}
        with patch('civ7.actions.run_script', new_callable=AsyncMock,
                   return_value={'status': 'submitted', 'before': before}) as submit, \
                patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock,
                      return_value={**before, 'phase': 'started', 'choicePending': False, 'selectionComplete': True}) as observe:
            result = await actions.confirm_transition_choices('token', 125, True)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertFalse(result['transitionCompleted'])
        self.assertEqual(submit.await_count, 1)
        self.assertEqual(observe.await_count, 1)

    async def test_nonblocking_acknowledgement_reports_success_and_chooser_cleanup_without_resubmission(self):
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'ageType': 'AGE_EXPLORATION',
                  'nextAge': 'AGE_MODERN', 'nextCivilization': 'CIVILIZATION_PRUSSIA', 'previousAgeCount': 1}
        with patch('civ7.actions.run_script', new_callable=AsyncMock,
                   return_value={'status': 'submitted', 'before': before}) as submit, \
                patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock,
                      return_value={**before, 'phase': 'started', 'choicePending': False,
                                    'choicesAcknowledged': True, 'chooserOpen': True}):
            result = await actions.confirm_transition_choices('token', 125, True)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertFalse(result['transitionCompleted'])
        self.assertTrue(result['requiresChooserClose'])
        self.assertEqual(result['nextAction'], 'view_civ7_transition_map')
        self.assertEqual(submit.await_count, 1)

    async def test_recovery_passes_explicit_expected_civilization_without_reconfirming_choices(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as submit:
            await actions.advance_age_transition('token', 125, True, expected_civilization='CIVILIZATION_PRUSSIA')
        self.assertEqual(submit.call_args.args[1]['operation'], 'advance')
        self.assertEqual(submit.call_args.args[1]['expected_civilization'], 'CIVILIZATION_PRUSSIA')
        for value in ('', ' ', True, 'x' * 513):
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await actions.advance_age_transition('token', 125, True, expected_civilization=value)
                run.assert_not_awaited()

    async def test_new_age_arrival_requires_exact_target_civilization_age_and_progression(self):
        self.assertTrue(callable(getattr(actions, 'advance_age_transition', None)))
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'ageType': 'AGE_EXPLORATION',
                  'nextAge': 'AGE_MODERN', 'civilization': 'CIVILIZATION_PRUSSIA', 'previousAgeCount': 1}
        for age, civ, count in [('AGE_MODERN', 'CIVILIZATION_PRUSSIA', 2),
                                ('AGE_MODERN', 'WRONG', 2), ('WRONG', 'CIVILIZATION_PRUSSIA', 2),
                                ('AGE_MODERN', 'CIVILIZATION_PRUSSIA', 1)]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'submitted', 'before': before}) as submit, \
                    patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, return_value={
                        'turn': 1, 'age': 99,
                        'phase': 'awaiting_begin', 'playerId': 0, 'ageType': age, 'civilization': civ, 'previousAgeCount': count,
                    }), patch('civ7.actions._TRANSITION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
                result = await actions.advance_age_transition('token', 125, True)
            self.assertEqual(result['status'], 'verified_applied' if age == 'AGE_MODERN' and civ == 'CIVILIZATION_PRUSSIA' and count == 2 else 'unknown')
            self.assertFalse(result.get('transitionCompleted', False))
            self.assertEqual(submit.await_count, 1)

    async def test_partial_arrival_is_not_accepted_and_first_transition_origin_can_have_zero_previous_ages(self):
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'ageType': 'AGE_ANTIQUITY',
                  'nextAge': 'AGE_EXPLORATION', 'civilization': 'CIVILIZATION_TEST', 'previousAgeCount': 0}
        for after, expected in [
            ({'phase': 'awaiting_begin', 'playerId': 0, 'ageType': 'AGE_EXPLORATION',
              'civilization': 'CIVILIZATION_TEST', 'previousAgeCount': 1}, 'unknown'),
            ({**before, 'phase': 'started', 'choicePending': False}, 'verified_applied'),
        ]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'submitted', 'before': before}), \
                    patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, return_value=after), \
                    patch('civ7.actions._TRANSITION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
                result = await actions.confirm_transition_choices('token', 125, True)
            self.assertEqual(result['status'], expected)
            self.assertFalse(result.get('transitionCompleted', False))

    async def test_begin_submits_once_and_observes_started_without_changing_other_loading_gates(self):
        before = {'turn': 1, 'age': 99, 'playerId': 0, 'previousAgeCount': 2,
                  'ageType': 'AGE_MODERN', 'civilization': 'CIVILIZATION_PRUSSIA'}
        with patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before},
            {**before, 'phase': 'started', 'transitionCompleted': False},
        ]) as run, patch('civ7.actions.run_script', new_callable=AsyncMock) as gameplay:
            result = await actions.begin_transition_age('loading-token')
        self.assertEqual(result['status'], 'verified_applied')
        self.assertFalse(result['transitionCompleted'])
        self.assertEqual([call.args for call in run.await_args_list], [
            ({'loading_token': 'loading-token', 'operation': 'begin'},), ({'operation': 'observe'},),
        ])
        gameplay.assert_not_awaited()

    async def test_loading_begin_can_reveal_the_separate_welcome_begin_without_resubmitting(self):
        before = {'turn': 1, 'age': 99, 'playerId': 0, 'previousAgeCount': 2,
                  'ageType': 'AGE_MODERN', 'civilization': 'CIVILIZATION_PRUSSIA', 'phase': 'awaiting_begin'}
        after = {**before, 'phase': 'awaiting_welcome', 'beginStage': 'welcome', 'loadingToken': 'welcome-token'}
        with patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before}, after,
        ]) as run:
            result = await actions.begin_transition_age('loading-token')
        self.assertEqual(result['status'], 'verified_applied')
        self.assertTrue(result['requiresBegin'])
        self.assertEqual(result['nextAction'], 'begin_civ7_transition_age')
        self.assertFalse(result['transitionCompleted'])
        self.assertEqual(run.await_count, 2)

    async def test_observed_age_loading_returns_submitted_not_a_timeout_or_false_arrival(self):
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'previousAgeCount': 1,
                  'ageType': 'AGE_EXPLORATION', 'nextAge': 'AGE_MODERN', 'nextCivilization': 'CIVILIZATION_PRUSSIA'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'submitted', 'before': before}) as submit, \
                patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, return_value={'phase': 'loading'}) as observe, \
                patch('civ7.actions._TRANSITION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
            result = await actions.advance_age_transition('token', 125, True)
        self.assertEqual(result['status'], 'submitted')
        self.assertTrue(result['loadingObserved'])
        self.assertFalse(result['transitionCompleted'])
        self.assertEqual(result['nextAction'], 'get_civ7_transition_workflow')
        self.assertEqual(submit.await_count, 1)
        self.assertEqual(observe.await_count, 1)

    async def test_boundary_reactivation_with_new_unit_blockers_is_blocked_not_unknown_and_never_retried(self):
        before = {'turn': 125, 'age': 1, 'playerId': 0, 'previousAgeCount': 1,
                  'ageType': 'AGE_EXPLORATION', 'nextAge': 'AGE_MODERN', 'nextCivilization': 'CIVILIZATION_PRUSSIA'}
        after = {**before, 'phase': 'started', 'choicePending': False, 'choicesAcknowledged': True,
                 'active': True, 'sent': False, 'hasBlocker': True, 'unitOrdersPending': True}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'submitted', 'before': before}) as submit, \
                patch('civ7.actions.run_transition_loading_script', new_callable=AsyncMock, return_value=after), \
                patch('civ7.actions._TRANSITION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
            result = await actions.advance_age_transition('token', 125, True)
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['nextAction'], 'get_civ7_turn_context')
        self.assertFalse(result['transitionCompleted'])
        self.assertEqual(submit.await_count, 1)

    async def test_all_non_boundary_wrappers_keep_fixed_modes_and_verify_once(self):
        before = {'turn': 1, 'age': 99, 'playerId': 0}
        for fn, args, mode in [
            (actions.open_transition, ('token', 1), 'open'),
            (actions.view_transition_map, ('token', 1), 'view_map'),
            (actions.apply_dedication_effect, ('EFFECT_A', 'token', 1), 'effect'),
            (actions.place_dedication_effect, ('EFFECT_A', 4, 5, 'token', 1), 'place_effect'),
            (actions.select_transition_capital, (10, 'token', 1), 'capital'),
            (actions.complete_dedications, ('token', 1, True, True), 'complete_deck'),
        ]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': before, 'expected': {'verified': True}}, {**before, 'verified': True},
            ]) as run:
                result = await fn(*args)
            self.assertEqual(result['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args[1]['operation'], mode)
            self.assertEqual(run.await_count, 2)

    async def test_boundary_timeouts_and_cancellation_never_resubmit(self):
        self.assertTrue(callable(getattr(actions, 'advance_age_transition', None)))
        for error in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(error):
                        await actions.advance_age_transition('token', 125, True)
                else:
                    self.assertEqual((await actions.advance_age_transition('token', 125, True))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)

    async def test_explicit_confirmation_and_strict_inputs_are_required_before_any_write(self):
        self.assertTrue(callable(getattr(actions, 'confirm_transition_choices', None)))
        for token, turn, confirm in [('', 125, True), ('token', True, True), ('token', 125, False)]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await actions.confirm_transition_choices(token, turn, confirm)
                run.assert_not_awaited()
