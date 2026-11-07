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
  const yDigits = String(bounds.maxY).length;
  const cellWidth = Math.max(4, 2 * Math.ceil((String(bounds.maxX).length + 1) / 2));
  const half = cellWidth / 2, rowStep = half + 2;
  const canvas = Array.from({length: (bounds.maxY - bounds.minY) * rowStep + 2 * half + 3},
    () => Array((bounds.maxX - bounds.minX + 1) * cellWidth + half + 1).fill(" "));
  const put = (cx, cy, character) => {canvas[cy][cx] = character;};
  let header = "x".padStart(yDigits) + " | ";
  for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
    const label = String(tx);
    header += label.padStart(half + Math.ceil(label.length / 2)).padEnd(cellWidth);
  }
  const rows = [header.trimEnd()];
  // North-up, absolute odd rows offset right; neighboring hexes share their edges.
  for (let ty = bounds.maxY; ty >= bounds.minY; ty--) {
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
      const left = (tx - bounds.minX) * cellWidth + (ty % 2 ? half : 0);
      const top = (bounds.maxY - ty) * rowStep;
      for (const [cx, cy] of [[half, 0], [0, half], [cellWidth, half], [0, half + 2],
        [cellWidth, half + 2], [half, 2 * half + 2]]) put(left + cx, top + cy, "+");
      for (let i = 1; i < half; i++) {
        put(left + half - i, top + i, "/");
        put(left + half + i, top + i, "\\");
        put(left + i, top + half + 2 + i, "\\");
        put(left + cellWidth - i, top + half + 2 + i, "/");
      }
      put(left, top + half + 1, "|");
      put(left + cellWidth, top + half + 1, "|");
      for (let i = 0; i < cell.length; i++) put(left + half - 1 + i, top + half + 1, cell[i]);
    }
  }
  for (let cy = 0; cy < canvas.length; cy++) {
    const tileRow = (cy - half - 1) / rowStep;
    const prefix = Number.isInteger(tileRow) && tileRow >= 0 && tileRow <= bounds.maxY - bounds.minY
      ? String(bounds.maxY - tileRow).padStart(yDigits) + " | " : " ".repeat(yDigits + 3);
    rows.push((prefix + canvas[cy].join("")).trimEnd());
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
    scope: "Connected north-up odd-row-offset hex grid with shared edges, clipped without wrapping. Base terrain only; no features, biomes, resources, yields or route/safety predictions. Fog contains no current city/unit details; invisible/unmet entities are omitted. An absent entity marker is not proof a tile is empty or safe. Coverage describes visible entity lookup availability within this viewport only"};
})()
