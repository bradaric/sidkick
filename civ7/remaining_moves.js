((canStartAny, firstReadyUnitStatus, unit) => {
  // panel-action.js showRemainingMovesState: ready alone is not always blocking.
  const result = {cycleRemainingMoves: null, remainingMovesBlocker: null};
  try {
    const setting = Configuration.getUser().isUnitCycle_RemainingMoves;
    if (typeof setting === "boolean") result.cycleRemainingMoves = setting;
  } catch { /* Missing preferences must not become permission to end a turn. */ }
  if (canStartAny === false || canStartAny === true && firstReadyUnitStatus === "none") {
    result.remainingMovesBlocker = false;
  } else if (canStartAny === true && firstReadyUnitStatus === "identified" && unit) {
    if (result.cycleRemainingMoves === true) result.remainingMovesBlocker = true;
    else if (result.cycleRemainingMoves === false) {
      if (unit.canMove === false || unit.hasMoved === true) result.remainingMovesBlocker = false;
      else if (unit.canMove === true && unit.hasMoved === false) result.remainingMovesBlocker = true;
    }
  }
  return result;
})
