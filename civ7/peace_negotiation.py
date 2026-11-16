"""Exact-term peace negotiation and bounded native inspection searches.

Searches edit the draft and send INSPECT only. They never propose/accept/reject.
"""

import asyncio
import json
import math
import time
from typing import Any, Literal
from uuid import uuid4

from pydantic import StrictFloat, StrictInt, StrictStr

from civ7.actions import _action_lock
from civ7.connection import run_script, run_started_script


def _integer(value: Any, maximum: int = 2**53 - 1) -> bool:
    return type(value) is int and 0 <= value <= maximum


def _token(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 250000


def _caps(gold: Any, influence: Any) -> bool:
    return all(type(v) in (int, float) and math.isfinite(v) and v >= 0 for v in (gold, influence))


async def read_negotiation(
    target_player_id: StrictInt, direction: Literal['outgoing', 'incoming'] = 'outgoing',
) -> dict[str, Any]:
    """Read the working draft, not just pending-deal status; never sends INSPECT."""
    if not _integer(target_player_id) or direction not in ('outgoing', 'incoming'):
        raise ValueError('Exact known counterpart and outgoing/incoming direction required')
    return await run_script('peace_negotiation_action.js', {
        'target_player_id': target_player_id, 'direction': direction, 'operation': 'observe',
    })


async def manage_deal(
    target_player_id: StrictInt,
    operation: Literal['prepare', 'add', 'remove', 'inspect', 'propose', 'accept', 'reject', 'restore'],
    deal_token: StrictStr, expected_turn: StrictInt,
    direction: Literal['outgoing', 'incoming'] = 'outgoing',
    item_token: StrictStr | None = None, item_id: StrictInt | None = None,
    max_gold_cost: StrictFloat = 0, max_influence_cost: StrictFloat = 0,
) -> dict[str, Any]:
    """One explicit edit, native preview, proposal or response. Never combines them."""
    if (not _integer(target_player_id) or not _integer(expected_turn) or not _token(deal_token)
            or operation not in ('prepare', 'add', 'remove', 'inspect', 'propose', 'accept', 'reject', 'restore')
            or direction not in ('outgoing', 'incoming') or not _caps(max_gold_cost, max_influence_cost)
            or operation == 'add' and not _token(item_token)
            or operation == 'remove' and not _integer(item_id)
            or item_token is not None and not _token(item_token)
            or item_id is not None and not _integer(item_id)):
        raise ValueError('Exact fresh draft/turn, supported operation, required item and nonnegative finite caps required')
    async with _action_lock:
        arguments = {'target_player_id': target_player_id, 'operation': operation,
            'deal_token': deal_token, 'expected_turn': expected_turn, 'direction': direction,
            'item_token': item_token, 'item_id': item_id,
            'max_gold_cost': max_gold_cost, 'max_influence_cost': max_influence_cost}
        if operation == 'restore':
            state = await read_negotiation(target_player_id, direction)
            if state.get('dealToken') != deal_token or state.get('turn') != expected_turn or not state.get('searchRecovery'):
                return {'status': 'rejected', 'reason': 'Fresh exact draft with unfinished searchRecovery required'}
            desired = []
            for item in state['searchRecovery']['originalItems']:
                if 'agreementType' in item:
                    continue
                key = term_key(item)
                matches = [offer['itemToken'] for offer in state['offers'] if offer.get('available') is True
                           and term_key(json.loads(offer['itemToken'])) == key]
                if any(term_key(i) == key for i in state['items']):
                    desired.append(json.dumps(item, separators=(',', ':')))
                elif len(matches) == 1:
                    desired.append(matches[0])
                else:
                    return {'status': 'rejected', 'reason': 'Original term is no longer offered; restore manually, no edits made'}
            state, failure = await _apply_terms(state, desired, arguments)
            if failure:
                return {**failure, 'restored': False, 'after': failure.get('after') or state, 'requiresFreshState': True}
            result = await _step({**arguments, 'operation': 'finish_search', 'deal_token': state['dealToken']})
            if result.get('status') == 'already_active':
                return {'status': 'verified_applied', 'restored': True, 'after': result}
            return {**result, 'restored': False}
        return await _step(arguments)


async def _step(arguments: dict[str, Any]) -> dict[str, Any]:
    """Called under the shared gameplay lock. Submit once, then read only."""
    result: dict[str, Any] = {'status': 'unknown'}
    after = None
    try:
        result = await run_started_script('peace_negotiation_action.js', {**arguments, 'request_id': uuid4().hex})
        if result.get('status') in ('rejected', 'already_active'):
            return result
        if result.get('status') != 'submitted':
            raise ValueError('Unexpected negotiation submission response')
        before = result['before']
        field = {'prepare': 'editApplied', 'add': 'editApplied', 'remove': 'editApplied',
                 'inspect': 'inspectionResolved', 'propose': 'proposalObserved',
                 'accept': 'peaceTermsApplied', 'reject': 'rejectionObserved'}[arguments['operation']]
        async with asyncio.timeout(15):
            while True:
                after = await run_started_script('peace_negotiation_state.js', {
                    **result['verificationArguments'], 'submission': result,
                })
                if not all(type(before.get(key)) is int and type(after.get(key)) is int
                           and before[key] == after[key] for key in ('turn', 'age', 'playerId')):
                    raise ValueError('Game context changed or is unverified')
                if after.get(field) is True:
                    return {**result, 'status': 'verified_applied', 'after': after}
                await asyncio.sleep(0.1)
    except Exception as exc:
        return {**result, 'status': 'unknown', 'after': after,
                'error': f'{type(exc).__name__}: {exc}',
                'reason': 'Outcome unknown. Read the negotiation and searchRecovery; never retry automatically.'}


def term_key(item: dict[str, Any]) -> str:
    """Native item IDs/validity may change when the same terms are re-added."""
    return json.dumps({k: v for k, v in item.items() if k not in ('id', 'isValid')}, sort_keys=True, separators=(',', ':'))


def _city_key(term: dict[str, Any]) -> str:
    city = term['city']
    return f"{city['owner']}:{city['id']}:{city['type']}:{city['x']}:{city['y']}"


def _summary(state: dict[str, Any], tokens: list[str], index: int) -> dict[str, Any]:
    give, receive = state['youGive'], state['youReceive']
    def net(kind: str) -> float:
        return sum(i['amount'] for i in receive if i['kind'] == kind) - sum(i['amount'] for i in give if i['kind'] == kind)
    return {'index': index, 'itemTokens': tokens, 'youGive': give, 'youReceive': receive,
            'netGold': net('Gold'), 'netInfluence': net('Influence'),
            'giveCities': sorted(_city_key(i) for i in give if i['kind'] == 'City'),
            'receiveCities': sorted(_city_key(i) for i in receive if i['kind'] == 'City')}


def frontier(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """No invented Gold/Influence exchange rate or interchangeable city-count score."""
    def dominates(a: dict[str, Any], b: dict[str, Any]) -> bool:
        weak = (a['netGold'] >= b['netGold'] and a['netInfluence'] >= b['netInfluence']
                and set(a['receiveCities']) >= set(b['receiveCities']) and set(a['giveCities']) <= set(b['giveCities']))
        strict = any(a[key] != b[key] for key in ('netGold', 'netInfluence', 'receiveCities', 'giveCities'))
        return weak and strict
    return [row for row in rows if not any(other is not row and dominates(other, row) for other in rows)]


async def _apply_terms(state: dict[str, Any], desired: list[str], common: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    keys = {term_key(json.loads(token)) for token in desired}
    for item in list(state['items']):
        if 'agreementType' in item or term_key(item) in keys:
            continue
        result = await _step({**common, 'operation': 'remove', 'deal_token': state['dealToken'], 'item_id': item['id']})
        if result.get('status') != 'verified_applied':
            return state, result
        state = result['after']
    for token in desired:
        key = term_key(json.loads(token))
        if any(term_key(i) == key for i in state['items']):
            continue
        matches = [offer for offer in state['offers'] if offer.get('available') is True
                   and term_key(json.loads(offer['itemToken'])) == key]
        if len(matches) != 1:
            return state, {'status': 'rejected', 'reason': 'A selected or restoration term is no longer uniquely offered'}
        result = await _step({**common, 'operation': 'add', 'deal_token': state['dealToken'], 'item_token': matches[0]['itemToken']})
        if result.get('status') != 'verified_applied':
            return state, result
        state = result['after']
    return state, None


async def search_deals(
    target_player_id: StrictInt, deal_token: StrictStr, candidate_item_tokens: list[StrictStr], expected_turn: StrictInt,
    max_gold_cost: StrictFloat = 0, max_influence_cost: StrictFloat = 0,
    offset: StrictInt = 0, limit: StrictInt = 16,
) -> dict[str, Any]:
    """Inspect a bounded batch of combinations and restore semantic original terms.

    Candidate tokens explicitly define the search space (up to 32). At most one
    lump of each currency, and one transfer mode for each city, can be selected.
    """
    if (not _integer(target_player_id) or not _integer(expected_turn) or not _token(deal_token)
            or not isinstance(candidate_item_tokens, list) or not 0 <= len(candidate_item_tokens) <= 32
            or any(not _token(token) for token in candidate_item_tokens)
            or len(set(candidate_item_tokens)) != len(candidate_item_tokens)
            or not _caps(max_gold_cost, max_influence_cost) or not _integer(offset)
            or not _integer(limit, 32) or limit < 1):
        raise ValueError('Fresh draft/turn, up to 32 distinct native candidate tokens, finite caps and batch limit 1–32 required')
    async with _action_lock:
        state = await read_negotiation(target_player_id)
        if (state.get('status') != 'ready' or state.get('dealToken') != deal_token
                or state.get('turn') != expected_turn or state.get('termsComplete') is not True
                or state.get('hasPeaceAgreement') is not True or state.get('pendingDeal') is not False
                or state.get('searchRecovery') or not _caps(state.get('gold'), state.get('influence'))):
            return {'status': 'rejected', 'reason': 'Fresh complete prepared outgoing draft without pending negotiation/unfinished search required'}
        available = {offer['itemToken']: offer for offer in state['offers'] if offer.get('available') is True}
        if any(token not in available for token in candidate_item_tokens):
            return {'status': 'rejected', 'reason': 'Every candidate must be an exact currently valid native offer'}
        original = list(state['items'])
        original_tokens = []
        for item in original:
            if 'agreementType' in item:
                continue
            if item.get('isValid') is False:
                return {'status': 'rejected', 'reason': 'Original concession is natively invalid; no edits made'}
            matches = [token for token in available if term_key(json.loads(token)) == term_key(item)]
            if len(matches) != 1:
                return {'status': 'rejected', 'reason': 'Original draft cannot be safely restored from current native offers; no edits made'}
            original_tokens.append(matches[0])
        original_summary = _summary(state, original_tokens, -1)
        if (sum(i['amount'] for i in state['youGive'] if i['kind'] == 'Gold') > min(max_gold_cost, state['gold'])
                or sum(i['amount'] for i in state['youGive'] if i['kind'] == 'Influence') > min(max_influence_cost, state['influence'])):
            return {'status': 'rejected', 'reason': 'Caps must also permit restoration of the existing draft'}

        groups: dict[str, list[str | None]] = {}
        for token in candidate_item_tokens:
            offer = available[token]
            key = f"City:{_city_key(offer)}" if offer['kind'] == 'City' else offer['kind']
            groups.setdefault(key, [None]).append(token)
        choices = list(groups.values())
        total = math.prod(len(group) for group in choices)
        if offset >= total:
            return {'status': 'rejected', 'reason': 'Offset is outside this candidate search space', 'totalCombinations': total}
        common = {'target_player_id': target_player_id, 'expected_turn': expected_turn, 'direction': 'outgoing',
                  'max_gold_cost': max_gold_cost, 'max_influence_cost': max_influence_cost}
        checkpoint = await _step({**common, 'operation': 'checkpoint', 'deal_token': state['dealToken']})
        if checkpoint.get('status') != 'already_active':
            return checkpoint
        state = checkpoint
        accepted, rejected = [], []
        considered = skipped = skipped_protected = 0
        failure = None
        started = time.monotonic()
        for index in range(offset, min(total, offset + limit)):
            # Stop between candidates, leaving time to restore. Never abort/retry a native request to hit this budget.
            if considered and time.monotonic() - started >= 60:
                break
            remainder, selected = index, []
            for group in choices:
                choice = group[remainder % len(group)]
                remainder //= len(group)
                if choice is not None:
                    selected.append(choice)
            considered += 1
            costs = {kind: sum(available[t]['amount'] for t in selected if available[t]['kind'] == kind
                              and available[t]['fromPlayerId'] == state['playerId']) for kind in ('Gold', 'Influence')}
            if costs['Gold'] > min(max_gold_cost, state['gold']) or costs['Influence'] > min(max_influence_cost, state['influence']):
                skipped += 1
                continue
            city_gifts = [available[t] for t in selected if available[t]['kind'] == 'City'
                          and available[t]['fromPlayerId'] == state['playerId'] and available[t]['transfer'] == 'offer']
            if city_gifts and len(city_gifts) >= len(state['ownedCities']):
                skipped_protected += 1
                continue
            state, failure = await _apply_terms(state, selected, common)
            if failure:
                break
            inspection = await _step({**common, 'operation': 'inspect', 'deal_token': state['dealToken']})
            if inspection.get('status') != 'verified_applied':
                failure = inspection
                break
            state = inspection['after']
            row = _summary(state, selected, index)
            (accepted if state['acceptance'] is True else rejected).append(row)

        restored = False
        # An unknown/cancelled action can still apply later. Never race it with restoration writes.
        if failure is None or failure.get('status') == 'rejected':
            state, restore_failure = await _apply_terms(state, original_tokens, common)
            if restore_failure is None:
                finished = await _step({**common, 'operation': 'finish_search', 'deal_token': state['dealToken']})
                restored = finished.get('status') == 'already_active'
                if restored:
                    state = finished
                else:
                    failure = finished
            else:
                failure = restore_failure
        return {'status': 'verified_applied' if restored and failure is None else 'unknown',
                'searchScope': 'Only supplied candidate tokens and spending caps; no proposals/acceptance. Frontier is for this batch only, not a global optimum or city-count score.',
                'totalCombinations': total, 'offset': offset, 'considered': considered, 'evaluated': len(accepted) + len(rejected),
                'skippedOverCaps': skipped, 'skippedProtectedCities': skipped_protected,
                'nextOffset': offset + considered if failure is None and offset + considered < total else None,
                'allCombinationsTested': failure is None and offset == 0 and len(accepted) + len(rejected) == total,
                'allEligibleCombinationsTested': failure is None and offset == 0 and considered == total,
                'offersComplete': state.get('offersComplete'), 'frontier': frontier(accepted),
                'accepted': accepted, 'rejected': rejected, 'restored': restored,
                'originalItems': original, 'originalDeal': original_summary,
                'after': (failure.get('after') or state) if failure else state, 'failure': failure, 'requiresFreshState': not restored,
                'note': 'Restoration preserves terms, not native item IDs or an old acceptance preview. On unknown/cancellation inspect searchRecovery; do not retry or overwrite the draft. Avoid concurrent UI edits/inspection.'}
