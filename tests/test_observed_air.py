import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
class ObservedAirTests(unittest.IsolatedAsyncioTestCase):
    async def test_district_bombardment_observation_is_also_explicit_and_strict(self):
        for name in ('bombard_district','bombard_shore_district'):
            with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
                await getattr(actions,name)(10,1,99,3,3,62,observe_effects=True)
            self.assertEqual(run.await_args.args[0],'ranged_district_attack.js');self.assertIs(run.await_args.args[1]['observe_effects'],True)
            with self.assertRaises(ValueError):await getattr(actions,name)(10,1,99,3,3,62,observe_effects=1)

    async def test_observation_is_opt_in_on_existing_fixed_air_intents(self):
        cases=[('air_attack_from_commander',(10,30,1,20,3,3,62),'air_attack_unit.js'),('air_attack_unit',(10,1,20,3,3,62),'air_attack_unit.js'),('group_air_attack',(30,'land',1,20,3,3,62),'group_air_attack.js'),('sweep_air_location',(30,3,3,62),'group_air_attack.js'),('bombard_air_district',(30,1,99,3,3,62),'group_air_attack.js')]
        for name,args,script in cases:
            with self.subTest(name=name),patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
                await getattr(actions,name)(*args,observe_effects=True)
            self.assertEqual(run.await_args.args[0],script);self.assertIs(run.await_args.args[1]['observe_effects'],True)
            with self.assertRaises(ValueError):await getattr(actions,name)(*args,observe_effects=1)
