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
  const terrainGlyphs = {TERRAIN_FLAT: " ", TERRAIN_HILL: "^", TERRAIN_MOUNTAIN: "M", TERRAIN_COAST: "~",
    TERRAIN_OCEAN: "O", TERRAIN_NAVIGABLE_RIVER: "="};
  const cells = [];
  for (let ty = bounds.maxY; ty >= bounds.minY; ty--) {
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
      const state = GameplayMap.getRevealedState(playerId, tx, ty);
      const visible = Number.isInteger(state) && state === RevealedStates.VISIBLE;
      const explored = visible || Number.isInteger(state) && state === RevealedStates.REVEALED;
      let terrain = null, fill = "?????", marker = "???";
      if (explored) {
        terrain = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(tx, ty))?.TerrainType ?? null;
        const glyph = Object.hasOwn(terrainGlyphs, terrain) ? terrainGlyphs[terrain] : "?";
        fill = glyph.repeat(5);
        marker = " ";
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
          marker = cityMarker ?? unitMarker ?? (citiesKnown && unitsKnown ? " " : "?");
        }
      }
      // Native odd-row offset -> axial coordinates -> flat-top projection.
      // This preserves all six native neighbors; geographic north projects upper-left.
      const q = tx - Math.floor(ty / 2);
      cells.push({x: tx, y: ty, terrain, visibility: visible ? "visible" : explored ? "fogged" : "unknown",
        fill, marker, fogged: explored && !visible, left: 6 * q, top: -4 * ty - 2 * q});
    }
  }
  if (queryArguments.render === "svg") {
    if (Game.turn !== turn || Game.age !== age || GameContext.localPlayerID !== playerId || !UI.isInGame())
      throw Error("Game context changed while reading the map; request fresh state");
    return {turn, age, playerId, mapWidth, mapHeight, center: {x, y}, requestedSize: {width, height}, bounds,
      tiles: cells.map(({x, y, terrain, visibility, marker}) => ({x, y, terrain, visibility, marker})),
      settlements, units, coverage};
  }
  const minLeft = Math.min(...cells.map(cell => cell.left)), minTop = Math.min(...cells.map(cell => cell.top));
  const canvasWidth = Math.max(...cells.map(cell => cell.left)) - minLeft + 9;
  const canvasHeight = Math.max(...cells.map(cell => cell.top)) - minTop + 5;
  const canvas = Array.from({length: canvasHeight}, () => Array(canvasWidth).fill(" "));
  const coordinateRows = new Map();
  const put = (cx, cy, character) => {
    if (canvas[cy][cx] !== " " && canvas[cy][cx] !== character) throw Error("Conflicting hex edges or contents");
    canvas[cy][cx] = character;
  };
  for (const cell of cells) {
    const left = cell.left - minLeft, top = cell.top - minTop;
    for (let i = 0; i < 5; i++) {
      const character = i === 0 || i === 4 ? "+" : "-";
      put(left + 2 + i, top, character);
      put(left + 2 + i, top + 4, character);
    }
    for (const [cx, cy, character] of [[1, 1, "/"], [7, 1, "\\"], [0, 2, "+"],
      [8, 2, "+"], [1, 3, "\\"], [7, 3, "/"]]) put(left + cx, top + cy, character);
    const bottom = cell.fogged ? " FOG " : cell.fill;
    for (let i = 0; i < 5; i++) {
      put(left + 2 + i, top + 1, cell.fill[i]);
      put(left + 2 + i, top + 3, bottom[i]);
    }
    for (let i = 0; i < cell.marker.length; i++) put(left + 4 - Math.floor(cell.marker.length / 2) + i, top + 2, cell.marker[i]);
    if (!coordinateRows.has(top + 2)) coordinateRows.set(top + 2, []);
    coordinateRows.get(top + 2).push(cell);
  }
  const rows = [`center (${x},${y}); N=upper-left E=upper-right`];
  for (let cy = 0; cy < canvas.length; cy++) {
    let line = canvas[cy].join("").trimEnd();
    const coordinates = coordinateRows.get(cy);
    if (coordinates) line = line.padEnd(canvasWidth) + "  " + coordinates.sort((a, b) => a.left - b.left)
      .map(cell => `(${cell.x},${cell.y})`).join(" ");
    rows.push(line);
  }
  if (Game.turn !== turn || Game.age !== age || GameContext.localPlayerID !== playerId || !UI.isInGame())
    throw Error("Game context changed while reading the ASCII map; request fresh state");
  return {turn, age, playerId, mapWidth, mapHeight, center: {x, y}, requestedSize: {width, height}, bounds,
    ascii: rows.join("\n"), settlements, units, coverage,
    projection: {style: "flat-top", north: "upper-left", east: "upper-right",
      coordinates: "Native (x,y) labels at the right of each tile-content line, ordered left-to-right"},
    legend: {cell: "Terrain fills the upper/lower interiors; an occupant is centered, with FOG in the lower interior for explored fog. City markers take precedence, but all observed units remain listed",
      terrain: {blank: "flat land", "^^^^^": "hill", MMMMM: "mountain", "~~~~~": "coast", OOOOO: "ocean", "=====": "navigable river", "?????": "unknown terrain"},
      overlay: {C: "own city centre", c: "met foreign city centre", U: "own unit", u: "met foreign nonwar unit", "!": "met enemy unit",
        blank: "no displayed entity, or entities withheld in fog", "?": "entity APIs/data unavailable"},
      visibility: {FOG: "explored but currently fogged", "center ???": "unrevealed or unknown visibility", "no FOG or center ???": "currently visible"}},
    scope: "Connected flat-top hex projection with +---+ outer caps and shared edges. Native odd-row coordinates and six-neighbor topology are preserved; north is upper-left, east upper-right. Requested native-coordinate bounds are clipped without wrapping; the projected outline is oblique, not rectangular. Base terrain only; no features, biomes, resources, yields or route/safety predictions. Fog contains no current city/unit details; invisible/unmet entities are omitted. An absent entity marker is not proof a tile is empty or safe. Coverage describes visible entity lookup availability within this viewport only"};
})()
