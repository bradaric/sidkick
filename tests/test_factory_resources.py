import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class FactoryResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_factory_reset_is_token_bound_and_opt_in(self):
        self.assertTrue(callable(getattr(actions,'clear_factory_resources',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.clear_factory_resources('Home','RESOURCE_FACTORY','{}',62)
        self.assertEqual(run.await_args.args,('clear_factory_resources.js',{'settlement':'Home','resource':'RESOURCE_FACTORY','target_token':'{}','expected_turn':62}))
        self.assertNotIn('clear_civ7_factory_resources',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('clear_civ7_factory_resources',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
