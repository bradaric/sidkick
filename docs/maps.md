# Map views

Both map tools take exact native `x`, `y` and optional **odd** `width` (1–31) and
`height` (1–21), defaulting to 15×9. Edges clip without wrapping. They are bounded
readers, separate from the large explored map and player snapshots/exports.

## ASCII

`get_civ7_ascii_map` returns `ascii`, projection metadata, native coordinates,
legend, settlement/unit lists, tiles and lookup coverage. Its connected flat-top
honeycomb preserves native neighbors, but **north projects upper-left and east
upper-right**, not straight up/right.

Terrain textures distinguish land, hills, mountains, coast, ocean and navigable
rivers. Centre markers include own/met cities (`C/c`), own/met nonwar units
(`U/u`), met enemies (`!`) and unavailable lookup (`?`). Cities take drawing
priority; **inspect `units[]` too**, including peaceful foreign Explorers.
The threat tool intentionally excludes peaceful units.

Explored fog retains terrain with `FOG`, not current entities. Hidden/unknown
visibility uses `???` without terrain/entity inspection. A missing marker does
not establish emptiness or safety; check viewport bounds and `coverage`.

## SVG

`get_civ7_svg_map` uses the same visibility-filtered viewport in a colored,
**north-up** projection. It returns structured tiles and atomically publishes
the latest successful SVG to Sidkick's temporary preview cache. Failed collection,
rendering or publication keeps the previous image. Latest successful call wins,
including across sessions. The turn/centre are labelled.

Visible single-unit markers show HP bars and percentages; hover gives exact HP.
Unknown/stacked health is `?`, not assumed full. City-marker hover lists visible
units without pretending unit HP is city HP. Tiles include current ownership on
hover/`tiles[].ownership` only when visible and local/met; fogged/hidden/unmet
ownership remains unknown. Neither map invents resources, yields or safe paths.
SVG labels are escaped; there are no scripts or external assets.

## SVG viewer

On the game host, explicitly start the separate static viewer:

```sh
civ7/.venv/bin/python -m sidkick.map_preview
```

It binds **127.0.0.1:8765** and serves only
**http://127.0.0.1:8765/sidkick-map.svg**. It has no game-control endpoint, file
listing, game polling or automatic browser launch. Missing images return 404.
The tool-owned Linux cache is `/tmp/opencode/sidkick-svg-preview/` and may vanish
at reboot. It is not a save/checkpoint.

The standalone MCP HTTP server uses the same default port: don't start the
viewer over another service. Use a different `sidkick.server --port` for MCP if
both are needed. Stop only your own process.

If the browser is on another machine, forward loopback through SSH:

```sh
ssh -N -L 127.0.0.1:8765:127.0.0.1:8765 user@game-host
```

Ask for a new SVG viewport, then refresh the fixed URL. Browser refresh only
fetches cached SVG bytes; it never queries the game. Health and ownership are
snapshots from the latest successful tool call, not live browser updates.
