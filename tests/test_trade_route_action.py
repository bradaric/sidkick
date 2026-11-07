import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


ARGS = {"unit_id": 20, "target_player_id": 5, "target_city_id": 10, "expected_turn": 58}
BEFORE = {"turn": 58, "age": 42, "playerId": 0, "routeCount": 2, "playerRouteCount": 0}
EXPECTED = {"targetPlayerId": 5, "targetCityId": 10, "newRouteObserved": True}
READ_ARGS = {**ARGS, "baseline_route_count": 2, "baseline_player_route_count": 0}
SUBMITTED = {"status": "submitted", "before": BEFORE, "expected": EXPECTED, "verificationArguments": READ_ARGS}
DISPATCH = {**SUBMITTED, "submissionKind": "send_merchant", "expected": {"tradeActionObserved": True},
            "verificationArguments": {**READ_ARGS, "dispatch_target": {"x": 18, "y": 39}}}


class TradeRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_merchant_reports_dispatch_not_route_establishment(self):
        for observations, status, outcome in [
            ({"newRouteObserved": False, "merchantMoveOrderObserved": True}, "submitted", "merchant_move_order_observed"),
            ({"newRouteObserved": False, "merchantMovementObserved": True}, "verified_partial", "merchant_moved_route_not_active"),
            ({"newRouteObserved": True, "merchantMoveOrderObserved": True}, "verified_applied", "route_established"),
        ]:
            with patch("civ7.actions.run_script", new_callable=AsyncMock,
                       side_effect=[DISPATCH, {**BEFORE, "tradeActionObserved": True, **observations}]) as run:
                result = await actions.establish_trade_route(20, 5, 10, 58)
            self.assertEqual(result["status"], status)
            self.assertEqual(result["outcome"], outcome)
            self.assertEqual([call.args[0] for call in run.await_args_list],
                             ["establish_trade_route.js", "trade_route_state.js"])
            if status == "submitted":
                self.assertFalse(result["queuedTargetVerified"])

    async def test_dispatch_changed_context_or_readback_timeout_is_unknown_without_retry(self):
        for readback in [{**BEFORE, "turn": 59, "tradeActionObserved": True}, TimeoutError()]:
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[DISPATCH, readback]) as run:
                result = await actions.establish_trade_route(20, 5, 10, 58)
            self.assertEqual(result["status"], "unknown")
            self.assertEqual(run.await_count, 2)
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[DISPATCH, asyncio.CancelledError()]) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.establish_trade_route(20, 5, 10, 58)
            self.assertEqual(run.await_count, 2)

    async def test_wrapper_uses_targeted_baseline_polling_and_never_resubmits(self):
        self.assertTrue(callable(getattr(actions, "establish_trade_route", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[SUBMITTED, {**BEFORE, **EXPECTED, "newRouteObserved": False},
                                {**BEFORE, **EXPECTED}]) as run, patch("civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.establish_trade_route(20, 5, 10, 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("establish_trade_route.js", ARGS))
        self.assertEqual([call.args for call in run.await_args_list[1:]], [("trade_route_state.js", READ_ARGS)] * 2)

    async def test_invalid_ids_and_turns_never_reach_transport(self):
        self.assertTrue(callable(getattr(actions, "establish_trade_route", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [(True, 5, 10, 58), (20, -1, 10, 58), (20, 5, True, 58), (20, 5, 10, True)]:
                with self.assertRaises(ValueError):
                    await actions.establish_trade_route(*args)
            run.assert_not_awaited()

    async def test_rejection_timeout_and_cancellation_never_retry(self):
        self.assertTrue(callable(getattr(actions, "establish_trade_route", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock, return_value={"status": "rejected"}) as run:
            self.assertEqual((await actions.establish_trade_route(20, 5, 10, 58))["status"], "rejected")
            self.assertEqual(run.await_count, 1)
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.establish_trade_route(20, 5, 10, 58))["status"], "unknown")
            self.assertEqual(run.await_count, 1)
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.establish_trade_route(20, 5, 10, 58)
            self.assertEqual(run.await_count, 1)

    async def test_mcp_registration_is_opt_in_strict_and_mutating(self):
        name = "establish_civ7_trade_route"
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn(name, normal)
        self.assertIn(name, set(tools))
        self.assertFalse(tools[name].annotations.read_only_hint)
        self.assertTrue(tools[name].annotations.destructive_hint)
        self.assertFalse(tools[name].annotations.idempotent_hint)
        self.assertEqual(set(tools[name].parameters["required"]), set(ARGS))
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[SUBMITTED, {**BEFORE, **EXPECTED}]):
            result = await create_server(enable_writes=True).call_tool(name, ARGS)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "verified_applied")
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[DISPATCH, {**BEFORE, "tradeActionObserved": True, "merchantMoveOrderObserved": True}]):
            result = await create_server(enable_writes=True).call_tool(name, ARGS)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "submitted")
        self.assertEqual(result.structured_content["outcome"], "merchant_move_order_observed")
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool(name, {**ARGS, "unit_id": True})
            run.assert_not_awaited()
