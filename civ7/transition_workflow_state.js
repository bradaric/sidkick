(() => {
  const state = transitionWorkflow.snapshot();
  const placement = typeof queryArguments === "undefined" ? null : queryArguments.placement;
  if (placement) {
    const cities = state.ownedSettlements;
    state.placementApplied = Array.isArray(cities) && Array.isArray(placement.before) &&
      cities.length === placement.before.length + 1 && placement.before.every(old => cities.some(city => city.id === old.id && city.x === old.x && city.y === old.y)) &&
      cities.filter(city => !placement.before.some(old => old.id === city.id) && city.x === placement.x && city.y === placement.y).length === 1;
  }
  return state;
})()
