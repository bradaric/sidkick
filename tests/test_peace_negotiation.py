import copy
import json
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import peace_negotiation as peace
from sidkick.server import create_server


def item_token(kind, amount, owner=3):
    return json.dumps({'id': 0, 'type': 2 if kind == 'Gold' else 3,
                       'subType': amount, 'from': owner, 'to': 0 if owner == 3 else 3,
                       'amount': amount, 'duration': 0, 'isValid': True}, separators=(',', ':'))


class PeaceNegotiationTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_is_fixed_read_only_and_new_actions_are_opt_in(self):
        read_tools = {t.name: t for t in create_server()._tool_manager.list_tools()}
        write_tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertTrue(read_tools['get_civ7_peace_negotiation'].annotations.read_only_hint)
        for name in ('manage_civ7_peace_deal', 'search_civ7_peace_deals'):
            self.assertNotIn(name, read_tools)
            self.assertFalse(write_tools[name].annotations.read_only_hint)
        with patch.object(peace, 'run_script', new_callable=AsyncMock, return_value={'status': 'ready'}) as run:
            await peace.read_negotiation(3)
        self.assertEqual(run.await_args.args, ('peace_negotiation_action.js',
                                             {'target_player_id': 3, 'direction': 'outgoing', 'operation': 'observe'}))

    async def test_validates_before_transport(self):
        with patch.object(peace, 'run_started_script', new_callable=AsyncMock) as run:
            for arguments in [dict(target_player_id=True), dict(expected_turn=-1), dict(deal_token=''),
                              dict(operation='send'), dict(max_gold_cost=float('nan')),
                              dict(operation='add'), dict(operation='remove')]:
                args = dict(target_player_id=3, operation='inspect', deal_token='draft', expected_turn=67)
                args.update(arguments)
                with self.assertRaises(ValueError):
                    await peace.manage_deal(**args)
            run.assert_not_awaited()

    async def test_inspection_waits_for_native_boolean_including_rejection_and_never_retries_send(self):
        for acceptance in (True, False):
            submission = {'status': 'submitted', 'before': {'turn': 67, 'age': 42, 'playerId': 0},
                          'operation': 'inspect', 'verificationArguments': {'target_player_id': 3}}
            base = {'turn': 67, 'age': 42, 'playerId': 0}
            with patch.object(peace, 'run_started_script', new_callable=AsyncMock, side_effect=[submission,
                    {**base, 'inspectionResolved': False},
                    {**base, 'inspectionResolved': True, 'acceptance': acceptance}]) as run:
                result = await peace.manage_deal(3, 'inspect', 'draft', 67)
            self.assertEqual(result['status'], 'verified_applied')
            self.assertIs(result['after']['acceptance'], acceptance)
            self.assertEqual(sum(c.args[0] == 'peace_negotiation_action.js' for c in run.await_args_list), 1)

    async def test_unknown_submission_is_not_retried(self):
        with patch.object(peace, 'run_started_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            result = await peace.manage_deal(3, 'inspect', 'draft', 67)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(run.await_count, 1)

    async def test_explicit_restore_can_finish_an_interrupted_search_without_proposing(self):
        state = {'status': 'ready', 'dealToken': 'fresh', 'turn': 67, 'items': [{'id': 1, 'type': 1, 'agreementType': 10}],
                 'searchRecovery': {'originalItems': [{'id': 10, 'type': 1, 'agreementType': 10}]}, 'offers': []}
        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, return_value=state), \
                patch.object(peace, '_step', new_callable=AsyncMock, return_value={**state, 'status': 'already_active', 'searchRecovery': None}) as step:
            result = await peace.manage_deal(3, 'restore', 'fresh', 67)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertTrue(result['restored'])
        self.assertEqual(step.await_count, 1)
        self.assertEqual(step.await_args.args[0]['operation'], 'finish_search')

    async def test_search_cancellation_propagates_without_cleanup_writes(self):
        import asyncio
        state = {'status': 'ready', 'dealToken': 'fresh', 'turn': 67, 'age': 42, 'playerId': 0,
                 'hasPeaceAgreement': True, 'termsComplete': True, 'pendingDeal': False,
                 'offers': [], 'items': [{'id': 1, 'type': 1, 'agreementType': 10}],
                 'youGive': [], 'youReceive': [], 'gold': 0, 'influence': 0}
        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, return_value=state), \
                patch.object(peace, '_step', new_callable=AsyncMock, side_effect=[
                    {**state, 'status': 'already_active'}, asyncio.CancelledError]) as step:
            with self.assertRaises(asyncio.CancelledError):
                await peace.search_deals(3, 'fresh', [], 67)
        self.assertEqual(step.await_count, 2)

    async def test_search_pagination_and_caps_report_partial_coverage_not_global_optimum(self):
        token = item_token('Gold', 600, owner=0)
        state = {'status': 'ready', 'dealToken': 'fresh', 'turn': 67, 'age': 42, 'playerId': 0,
                 'hasPeaceAgreement': True, 'termsComplete': True, 'pendingDeal': False,
                 'offers': [{'kind': 'Gold', 'fromPlayerId': 0, 'toPlayerId': 3, 'amount': 600,
                             'available': True, 'itemToken': token}],
                 'items': [{'id': 1, 'type': 1, 'agreementType': 10}],
                 'youGive': [], 'youReceive': [], 'gold': 1000, 'influence': 0}
        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, return_value=state), \
                patch.object(peace, '_step', new_callable=AsyncMock, side_effect=[
                    {**state, 'status': 'already_active'}, {**state, 'status': 'already_active'}]) as step:
            result = await peace.search_deals(3, 'fresh', [token], 67, offset=1, limit=1)
        self.assertFalse(result['allCombinationsTested'])
        self.assertEqual(result['skippedOverCaps'], 1)
        self.assertEqual(result['evaluated'], 0)
        self.assertTrue(result['restored'])
        self.assertIsNone(result['nextOffset'])
        self.assertEqual(step.await_count, 2)

    async def test_search_skips_last_settlement_concession_without_touching_the_draft(self):
        token = json.dumps({'id': 0, 'type': 4, 'subType': 2, 'cityTransferType': 2, 'from': 0, 'to': 3,
                            'duration': 0, 'isValid': True, 'cityId': {'owner': 0, 'id': 7, 'type': 8}})
        state = {'status': 'ready', 'dealToken': 'fresh', 'turn': 67, 'age': 42, 'playerId': 0,
                 'hasPeaceAgreement': True, 'termsComplete': True, 'pendingDeal': False,
                 'offers': [{'kind': 'City', 'fromPlayerId': 0, 'toPlayerId': 3, 'transfer': 'offer',
                             'city': {'owner': 0, 'id': 7, 'type': 8, 'x': 2, 'y': 3},
                             'available': True, 'itemToken': token}], 'ownedCities': [{'id': 7}],
                 'items': [{'id': 1, 'type': 1, 'agreementType': 10}],
                 'youGive': [], 'youReceive': [], 'gold': 1000, 'influence': 0}
        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, return_value=state), \
                patch.object(peace, '_step', new_callable=AsyncMock, side_effect=[
                    {**state, 'status': 'already_active'}, {**state, 'status': 'already_active'}]) as step:
            result = await peace.search_deals(3, 'fresh', [token], 67, offset=1, limit=1)
        self.assertEqual(result['skippedProtectedCities'], 1)
        self.assertEqual(result['evaluated'], 0)
        self.assertTrue(result['restored'])
        self.assertEqual(step.await_count, 2)

    async def test_search_exhausts_legal_currency_combinations_restores_draft_and_returns_frontier(self):
        gold = item_token('Gold', 600)
        more_gold = item_token('Gold', 1500)
        influence = item_token('Influence', 300, owner=0)
        offers = [{'kind': 'Gold', 'fromPlayerId': 3, 'toPlayerId': 0, 'amount': amount,
                   'available': True, 'itemToken': token} for amount, token in [(600, gold), (1500, more_gold)]]
        offers.append({'kind': 'Influence', 'fromPlayerId': 0, 'toPlayerId': 3, 'amount': 300,
                       'available': True, 'itemToken': influence})
        state = {'status': 'ready', 'turn': 67, 'age': 42, 'playerId': 0, 'targetPlayerId': 3,
                 'direction': 'outgoing', 'dealToken': 'initial', 'hasPeaceAgreement': True,
                 'termsComplete': True, 'offersComplete': True, 'pendingDeal': False,
                 'gold': 577, 'influence': 774, 'offers': offers, 'items': [
                     {'id': 10, 'type': 1, 'agreementType': 10}, {**json.loads(influence), 'id': 11}],
                 'youGive': [{**offers[-1], 'itemId': 11}], 'youReceive': []}
        original = copy.deepcopy(state['items'])
        calls = []

        async def step(arguments):
            calls.append(arguments['operation'])
            self.assertEqual(arguments['deal_token'], state['dealToken'])
            op = arguments['operation']
            if op == 'remove':
                state['items'] = [i for i in state['items'] if i['id'] != arguments['item_id']]
            elif op == 'add':
                state['items'].append({**json.loads(arguments['item_token']), 'id': len(calls) + 20})
            elif op == 'checkpoint':
                state['searchRecovery'] = {'originalItems': original}
            elif op == 'finish_search':
                state['searchRecovery'] = None
            self.assertIn(op, ('remove', 'add', 'inspect', 'checkpoint', 'finish_search'))
            state['dealToken'] = f'fresh-{len(calls)}'
            state['youGive'], state['youReceive'] = [], []
            for i in state['items'][1:]:
                description = next(o for o in offers if peace.term_key(json.loads(o['itemToken'])) == peace.term_key(i))
                state['youGive' if i['from'] == 0 else 'youReceive'].append({**description, 'itemId': i['id']})
            # 1500 Gold requires the 300 Influence concession; 600 Gold is free.
            state['acceptance'] = not any(i.get('amount') == 1500 for i in state['items']) or any(
                i.get('amount') == 300 for i in state['items'])
            if op in ('checkpoint', 'finish_search'):
                return {**copy.deepcopy(state), 'status': 'already_active'}
            return {'status': 'verified_applied', 'after': copy.deepcopy(state)}

        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, side_effect=lambda *a, **k: copy.deepcopy(state)), \
                patch.object(peace, '_step', side_effect=step):
            result = await peace.search_deals(3, 'initial', [gold, more_gold, influence], 67,
                                             max_influence_cost=300, limit=16)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(result['totalCombinations'], 6)  # neither/600/1500 × neither/300
        self.assertEqual(result['evaluated'], 6)
        self.assertTrue(result['allCombinationsTested'])
        self.assertTrue(result['restored'])
        self.assertEqual([peace.term_key(i) for i in state['items']], [peace.term_key(i) for i in original])
        self.assertEqual(calls.count('inspect'), 6)
        self.assertEqual(len(result['frontier']), 2)
        self.assertEqual({(r['netGold'], r['netInfluence']) for r in result['frontier']}, {(600, 0), (1500, -300)})

    async def test_frontier_preserves_named_city_tradeoffs_not_city_count_scores(self):
        a = {'netGold': 600, 'netInfluence': 0, 'receiveCities': ['A'], 'giveCities': []}
        b = {'netGold': 600, 'netInfluence': 0, 'receiveCities': ['B'], 'giveCities': []}
        worse = {'netGold': 0, 'netInfluence': 0, 'receiveCities': [], 'giveCities': ['C']}
        self.assertEqual(peace.frontier([a, b, worse]), [a, b])

    async def test_search_unknown_stops_without_restoring_over_potentially_late_edits(self):
        token = item_token('Gold', 600)
        state = {'status': 'ready', 'turn': 67, 'age': 42, 'playerId': 0, 'targetPlayerId': 3,
                 'direction': 'outgoing', 'dealToken': 'initial', 'hasPeaceAgreement': True,
                 'termsComplete': True, 'offersComplete': True, 'pendingDeal': False, 'gold': 577, 'influence': 774,
                 'items': [{'id': 10, 'type': 1, 'agreementType': 10}], 'youGive': [], 'youReceive': [],
                 'offers': [{'kind': 'Gold', 'fromPlayerId': 3, 'toPlayerId': 0, 'amount': 600,
                             'available': True, 'itemToken': token}]}
        with patch.object(peace, 'read_negotiation', new_callable=AsyncMock, return_value=state), \
                patch.object(peace, '_step', new_callable=AsyncMock, side_effect=[
                    {**state, 'status': 'already_active'}, {'status': 'unknown'}]) as step:
            result = await peace.search_deals(3, 'initial', [token], 67)
        self.assertEqual(result['status'], 'unknown')
        self.assertFalse(result['restored'])
        self.assertEqual(step.await_count, 2)
        self.assertEqual(result['originalItems'], state['items'])
