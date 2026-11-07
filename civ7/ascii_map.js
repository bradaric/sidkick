(() => {
  const {x, y, width = 15, height = 9} = queryArguments;
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 ||
      width < 1 || width > 31 || width % 2 !== 1 || height < 1 || height > 21 || height % 2 !== 1)
    throw Error("Nonnegative center coordinates and odd viewport width 1-31 / height 1-21 are required");
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const turn = Game.turn, age = Game.age;
  const mapWidth = GameplayMap.getGridWidth(), mapHeight = GameplayMap.getGridHeight();
  if (![mapWidth, mapHeight].every(value => Number.isInteger(value) && value > 0) || x >= mapWidth || y >= mapHeight)
    throw Error("Center coordinates must be inside the map dimensions");
  const bounds = {minX: Math.max(0, x - (width - 1) / 2), maxX: Math.min(mapWidth - 1, x + (width - 1) / 2),
    minY: Math.max(0, y - (height - 1) / 2), maxY: Math.min(mapHeight - 1, y + (height - 1) / 2)};
  const canCities = typeof MapCities !== "undefined" && typeof MapCities.getCity === "function" &&
    typeof Cities !== "undefined" && typeof Cities.get === "function";
  const canUnits = typeof MapUnits !== "undefined" && typeof MapUnits.getUnits === "function" &&
    typeof Units !== "undefined" && typeof Units.get === "function" &&
    typeof Visibility !== "undefined" && typeof Visibility.isVisible === "function";
  const coverage = {settlements: canCities, units: canUnits};
  const settlements = [], units = [], seenUnits = new Set();
  const known = id => id && Number.isInteger(id.owner) && id.owner >= 0 && Number.isInteger(id.id) && id.id >= 0 &&
    (id.owner === playerId || player.Diplomacy.hasMet(id.owner) === true);
  const terrainGlyphs = {TERRAIN_FLAT: ".", TERRAIN_HILL: "^", TERRAIN_MOUNTAIN: "M", TERRAIN_COAST: "~",
    TERRAIN_OCEAN: "O", TERRAIN_NAVIGABLE_RIVER: "="};
  const yDigits = String(bounds.maxY).length, cellWidth = Math.max(4, String(bounds.maxX).length + 1);
  let header = "x".padStart(yDigits) + " | ";
  for (let tx = bounds.minX; tx <= bounds.maxX; tx++) header += String(tx).padStart(cellWidth - 1) + " ";
  const rows = [header.trimEnd()];
  // Match native map-debug-helpers.js: north-up, absolute odd rows offset right.
  for (let ty = bounds.maxY; ty >= bounds.minY; ty--) {
    let row = String(ty).padStart(yDigits) + " | " + (ty % 2 ? " ".repeat(Math.floor(cellWidth / 2)) : "");
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
      const state = GameplayMap.getRevealedState(playerId, tx, ty);
      const visible = Number.isInteger(state) && state === RevealedStates.VISIBLE;
      const explored = visible || Number.isInteger(state) && state === RevealedStates.REVEALED;
      let cell = "???";
      if (explored) {
        const terrain = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(tx, ty))?.TerrainType;
        const glyph = Object.hasOwn(terrainGlyphs, terrain) ? terrainGlyphs[terrain] : "?";
        let overlay = " ";
        if (visible) {
          let cityMarker = null, unitMarker = null, citiesKnown = canCities, unitsKnown = canUnits;
          if (canCities) {
            const id = MapCities.getCity(tx, ty);
            if (known(id)) {
              const city = Cities.get(id);
              if (!city) {citiesKnown = false; coverage.settlements = false;}
              else if (city.owner === id.owner && city.id?.owner === id.owner && city.id?.id === id.id &&
                  city.location?.x === tx && city.location?.y === ty) {
                cityMarker = id.owner === playerId ? "C" : "c";
                settlements.push({x: tx, y: ty, ownerId: id.owner, cityId: id.id, name: Locale.compose(city.name), marker: cityMarker});
              }
            }
          }
          if (canUnits) {
            const ids = MapUnits.getUnits(tx, ty);
            if (!Array.isArray(ids)) {unitsKnown = false; coverage.units = false;}
            else for (const id of ids) {
              if (!known(id) || Visibility.isVisible(playerId, id) !== true) continue;
              const key = `${id.owner}:${id.id}:${id.type}`;
              if (seenUnits.has(key)) continue;
              const unit = Units.get(id);
              if (!unit) {unitsKnown = false; coverage.units = false; continue;}
              if (unit.owner !== id.owner || unit.id?.id !== id.id || unit.id?.owner !== id.owner ||
                  unit.isOnMap !== true || unit.isDead === true || unit.location?.x !== tx || unit.location?.y !== ty) continue;
              seenUnits.add(key);
              const marker = id.owner === playerId ? "U" : player.Diplomacy.isAtWarWith(id.owner) === true ? "!" : "u";
              if (!unitMarker || marker === "!" || marker === "U" && unitMarker !== "!") unitMarker = marker;
              const def = GameInfo.Units.lookup(unit.type);
              units.push({x: tx, y: ty, ownerId: id.owner, instanceId: id.id, unitType: def?.UnitType ?? null,
                name: Locale.compose(unit.name ?? def?.Name ?? ""), marker});
            }
          }
          overlay = cityMarker ?? unitMarker ?? (citiesKnown && unitsKnown ? "." : "?");
        }
        cell = glyph + overlay + (visible ? "." : ":");
      }
      row += cell.padEnd(cellWidth);
    }
    rows.push(row.trimEnd());
  }
  if (Game.turn !== turn || Game.age !== age || GameContext.localPlayerID !== playerId || !UI.isInGame())
    throw Error("Game context changed while reading the ASCII map; request fresh state");
  return {turn, age, playerId, mapWidth, mapHeight, center: {x, y}, requestedSize: {width, height}, bounds,
    ascii: rows.join("\n"), settlements, units, coverage,
    legend: {cell: "terrain + overlay + visibility; city markers take precedence, but all observed units remain listed",
      terrain: {".": "flat land", "^": "hill", M: "mountain", "~": "coast", O: "ocean", "=": "navigable river", "?": "unknown terrain"},
      overlay: {C: "own city centre", c: "met foreign city centre", U: "own unit", u: "met foreign nonwar unit", "!": "met enemy unit",
        ".": "no displayed entity", " ": "entities withheld in fog", "?": "entity APIs/data unavailable"},
      visibility: {".": "currently visible", ":": "explored but currently fogged", "???": "unrevealed or unknown visibility"}},
    scope: "North-up odd-row-offset coordinate grid, clipped without wrapping. Base terrain only; no features, biomes, resources, yields or route/safety predictions. Fog contains no current city/unit details; invisible/unmet entities are omitted. An absent entity marker is not proof a tile is empty or safe. Coverage describes visible entity lookup availability within this viewport only"};
})()
