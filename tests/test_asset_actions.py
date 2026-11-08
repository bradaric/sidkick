import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


class ResourceActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_resource_assignment_passes_identity_as_data_and_verifies_targeted_readback(self):
        self.assertTrue(callable(getattr(actions, "assign_resource", None)))
        before = {"turn": 58, "age": 42, "playerId": 0,
                  "resource": {"instance": 7, "offMap": False}, "assignedCityId": 10}
        expected = {"resource": before["resource"], "assignedCityId": 20}
        submitted = {"status": "submitted", "before": before, "expected": expected}
        args = {"resource_instance": 7, "off_map": False, "settlement": "Target", "expected_turn": 58}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[submitted, {**before, **expected}]) as run:
            result = await actions.assign_resource(7, False, " Target ", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("assign_resource.js", args))
        self.assertEqual(run.await_args_list[1].args, ("resource_assignment_state.js", args))

    async def test_resource_inputs_and_registration_are_strict_and_opt_in(self):
        self.assertTrue(callable(getattr(actions, "assign_resource", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [(True, False, "Target", 58), (7, 1, "Target", 58),
                         (7, False, " ", 58), (7, False, "Target", True)]:
                with self.assertRaises(ValueError):
                    await actions.assign_resource(*args)
            run.assert_not_awaited()
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn("assign_civ7_resource", normal)
        self.assertIn("assign_civ7_resource", set(tools))
        tool = tools["assign_civ7_resource"]
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertEqual(set(tool.parameters["required"]), {"resource_instance", "off_map", "settlement", "expected_turn"})


class AttributeActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_attribute_purchase_uses_targeted_readback_and_exact_unlock(self):
        self.assertTrue(callable(getattr(actions, "buy_attribute_node", None)))
        before = {"turn": 58, "age": 42, "playerId": 0, "node": "NODE_ATTRIBUTE_A", "depthUnlocked": 0}
        expected = {"node": "NODE_ATTRIBUTE_A", "depthUnlocked": 1}
        args = {"node": "NODE_ATTRIBUTE_A", "expected_turn": 58}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[{"status": "submitted", "before": before, "expected": expected}, {**before, **expected}]) as run:
            result = await actions.buy_attribute_node(" NODE_ATTRIBUTE_A ", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("buy_attribute_node.js", args))
        self.assertEqual(run.await_args_list[1].args, ("attribute_node_state.js", args))

    async def test_attribute_tool_is_opt_in_and_rejects_invalid_inputs(self):
        self.assertTrue(callable(getattr(actions, "buy_attribute_node", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for node, turn in [(" ", 58), (101, 58), ("NODE", True)]:
                with self.assertRaises(ValueError):
                    await actions.buy_attribute_node(node, turn)
            run.assert_not_awaited()
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn("buy_civ7_attribute_node", normal)
        self.assertIn("buy_civ7_attribute_node", set(tools))
        self.assertFalse(tools["buy_civ7_attribute_node"].annotations.read_only_hint)
        self.assertEqual(set(tools["buy_civ7_attribute_node"].parameters["required"]), {"node", "expected_turn"})


class GreatWorkActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_great_work_move_verifies_exact_owned_instance_location(self):
        self.assertTrue(callable(getattr(actions, "move_great_work", None)))
        before = {"turn": 58, "age": 42, "playerId": 0, "greatWorkIndex": 6,
                  "location": {"archived": False, "cityId": 10, "buildingType": "BUILDING_PALACE"}}
        expected = {"greatWorkIndex": 6, "location": {"archived": False, "cityId": 20, "buildingType": "BUILDING_MUSEUM"}}
        args = {"great_work_index": 6, "destination_city_id": 20,
                "destination_building": "BUILDING_MUSEUM", "expected_turn": 58}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[{"status": "submitted", "before": before, "expected": expected}, {**before, **expected}]) as run:
            result = await actions.move_great_work(6, 20, " BUILDING_MUSEUM ", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("move_great_work.js", args))
        self.assertEqual(run.await_args_list[1].args, ("great_work_location_state.js", args))

    async def test_great_work_inputs_and_registration_are_strict_and_opt_in(self):
        self.assertTrue(callable(getattr(actions, "move_great_work", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [(True, 20, "BUILDING_MUSEUM", 58), (6, True, "BUILDING_MUSEUM", 58),
                         (6, 20, " ", 58), (6, 20, "BUILDING_MUSEUM", True)]:
                with self.assertRaises(ValueError):
                    await actions.move_great_work(*args)
            run.assert_not_awaited()
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn("move_civ7_great_work", normal)
        self.assertIn("move_civ7_great_work", set(tools))
        tool = tools["move_civ7_great_work"]
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertEqual(set(tool.parameters["required"]), {
            "great_work_index", "destination_city_id", "destination_building", "expected_turn",
        })


ASSET_CASES = [
    ("assign_civ7_resource", {"resource_instance": 7, "off_map": False, "settlement": "Target", "expected_turn": 58},
     {"resource": {"instance": 7, "offMap": False}, "assignedCityId": 20}),
    ("buy_civ7_attribute_node", {"node": "NODE_ATTRIBUTE_A", "expected_turn": 58},
     {"node": "NODE_ATTRIBUTE_A", "depthUnlocked": 1}),
    ("move_civ7_great_work", {"great_work_index": 6, "destination_city_id": 20,
                            "destination_building": "BUILDING_MUSEUM", "expected_turn": 58},
     {"greatWorkIndex": 6, "location": {"archived": False, "cityId": 20, "buildingType": "BUILDING_MUSEUM"}}),
]


class AssetMcpTests(unittest.IsolatedAsyncioTestCase):
    async def test_asset_actions_return_structured_results_through_mcp(self):
        for name, arguments, expected in ASSET_CASES:
            before = {"turn": 58, "age": 42, "playerId": 0}
            submitted = {"status": "submitted", "before": before, "expected": expected}
            with self.subTest(tool=name), patch("civ7.actions.run_script", new_callable=AsyncMock,
                                               side_effect=[submitted, {**before, **expected}]) as run:
                result = await create_server(enable_writes=True).call_tool(name, arguments)
                self.assertFalse(result.is_error)
                self.assertEqual(result.structured_content["status"], "verified_applied")
                self.assertEqual(run.await_count, 2)

    async def test_locked_asset_actions_do_not_submit_or_read_again(self):
        for name, arguments, _ in ASSET_CASES:
            with self.subTest(tool=name), patch("civ7.actions.run_script", new_callable=AsyncMock,
                                               return_value={"status": "rejected", "reason": "Blocked"}) as run:
                result = await create_server(enable_writes=True).call_tool(name, arguments)
                self.assertEqual(result.structured_content["status"], "rejected")
                self.assertEqual(run.await_count, 1)

    async def test_mcp_does_not_coerce_asset_selectors_flags_or_turns(self):
        malformed = [{"off_map": 1}, {"expected_turn": True}, {"great_work_index": True}]
        for (name, arguments, _), replacement in zip(ASSET_CASES, malformed):
            with self.subTest(tool=name), patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {**arguments, **replacement})
                run.assert_not_awaited()
