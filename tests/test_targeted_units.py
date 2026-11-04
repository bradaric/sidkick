import unittest
from unittest.mock import AsyncMock, patch

from civ7 import queries
from sidkick.server import create_server


class TargetedUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_combat_adapter_and_mcp_require_target_coordinates(self):
        self.assertTrue(callable(getattr(queries, "combat_options", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"turn": 109}) as run:
            result = await create_server().call_tool("get_civ7_combat_options", {"unit_id": 7, "x": 1, "y": 2})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {"turn": 109})
        run.assert_awaited_once_with("combat.js", {"unit_id": 7, "x": 1, "y": 2})
        with patch("civ7.queries.run_script", new_callable=AsyncMock) as run:
            for args in [(True, 1, 2), (7, -1, 2), (7, 1.5, 2)]:
                with self.subTest(args=args), self.assertRaises(ValueError):
                    await queries.combat_options(*args)
            run.assert_not_awaited()

    async def test_movement_passes_unit_and_optional_coordinates_as_data(self):
        self.assertTrue(callable(getattr(queries, "movement_and_founding", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"turn": 109}) as run:
            self.assertEqual(await queries.movement_and_founding(7, 1, 2), {"turn": 109})
        run.assert_awaited_once_with("movement.js", {"unit_id": 7, "x": 1, "y": 2})

    async def test_invalid_movement_arguments_do_not_query_the_game(self):
        self.assertTrue(callable(getattr(queries, "movement_and_founding", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock) as run:
            for args in [(-1,), (True,), (7, 1), (7, -1, 2), (7, 1.5, 2)]:
                with self.subTest(args=args), self.assertRaises(ValueError):
                    await queries.movement_and_founding(*args)
            run.assert_not_awaited()

    async def test_movement_mcp_requires_unit_and_returns_structured_output(self):
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertIn("get_civ7_movement_and_founding", tools)
        self.assertIn("unit_id", tools["get_civ7_movement_and_founding"].parameters["required"])
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value={"turn": 109}) as run:
            result = await server.call_tool("get_civ7_movement_and_founding", {"unit_id": 7})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {"turn": 109})
        run.assert_awaited_once_with("movement.js", {"unit_id": 7, "x": None, "y": None})
