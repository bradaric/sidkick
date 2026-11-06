(() => {
  const {city_state_id: targetId, bonus, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![targetId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || typeof bonus !== "string" || !bonus) return reject("Exact city-state, bonus definition and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn ||
      targetId === playerId || player.Diplomacy.hasMet(targetId) !== true) return reject("A fresh active turn and met city-state are required");
  const target = Players.get(targetId), def = GameInfo.CityStateBonuses.lookup(bonus);
  const eligible = () => target?.isMinor === true && target.Influence?.getSuzerain() === playerId && Game.CityStates.getCityStateBonusToSelect(playerId) === targetId &&
    Game.CityStates.canHaveBonus(playerId, targetId, bonus) === true;
  if (def?.CityStateBonusType !== bonus || !Number.isInteger(def.$hash) || !eligible()) return reject("Exact eligible bonus and current pending choice under local suzerainty are required");
  const before = {turn: Game.turn, age: Game.age, playerId, targetId, bonus: Game.CityStates.getBonusType(targetId)};
  const args = {OtherPlayer: targetId, CityStateBonusType: def.$hash}, operation = PlayerOperationTypes.CHOOSE_CITY_STATE_BONUS;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native bonus selection failed or requires confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.hasMet(targetId) !== true || !eligible() || Game.CityStates.getBonusType(targetId) !== before.bonus) return reject("Pending choice, suzerainty, bonus or game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected: {bonusObserved: true}, verificationArguments: {city_state_id: targetId, expected_bonus: def.$hash},
    verificationScope: "Chosen city-state bonus and consumed pending choice under preserved local suzerainty; not complete accounting of every resulting yield, unit or resource effect"};
})()
