"""Pure SVG rendering and atomic publication to Sidkick's owned preview cache."""

import math
import os
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET


PREVIEW_DIR = Path(tempfile.gettempdir()) / "opencode" / "sidkick-svg-preview"
PREVIEW_NAME = "sidkick-map.svg"
PREVIEW_URL = f"http://127.0.0.1:8765/{PREVIEW_NAME}"
TERRAINS = {
    "TERRAIN_FLAT": ("#6caa70", "LAND", ""),
    "TERRAIN_HILL": ("#b9884f", "HILLS", "^^"),
    "TERRAIN_MOUNTAIN": ("#a8aeb8", "MTN", "M"),
    "TERRAIN_COAST": ("#57b9cc", "COAST", "~~"),
    "TERRAIN_OCEAN": ("#24568f", "OCEAN", "~~"),
    "TERRAIN_NAVIGABLE_RIVER": ("#348fbe", "RIVER", "="),
}


def _validate(view):
    integer = lambda value: type(value) is int and value >= 0
    # Game.age is a native integer hash, not a nonnegative Age index.
    if (type(view.get("age")) is not int
            or any(not integer(view.get(key)) for key in ("turn", "playerId", "mapWidth", "mapHeight"))):
        raise ValueError("Unverified map context")
    bounds = view.get("bounds", {})
    if any(not integer(bounds.get(key)) for key in ("minX", "maxX", "minY", "maxY")):
        raise ValueError("Unverified map bounds")
    if not (0 <= bounds["maxX"] - bounds["minX"] < 31 and 0 <= bounds["maxY"] - bounds["minY"] < 21
            and bounds["maxX"] < view["mapWidth"] and bounds["maxY"] < view["mapHeight"]):
        raise ValueError("Map viewport is unbounded or outside the map")
    center = view.get("center", {})
    if (not integer(center.get("x")) or not integer(center.get("y"))
            or not bounds["minX"] <= center["x"] <= bounds["maxX"]
            or not bounds["minY"] <= center["y"] <= bounds["maxY"]):
        raise ValueError("Unverified map center")
    size = view.get("requestedSize", {})
    if any(type(size.get(key)) is not int or not 1 <= size[key] <= limit or size[key] % 2 != 1
           for key, limit in (("width", 31), ("height", 21))):
        raise ValueError("Invalid requested map dimensions")
    coverage = view.get("coverage", {})
    if any(type(coverage.get(key)) is not bool for key in ("settlements", "units")):
        raise ValueError("Unverified map overlay coverage")
    tiles = view.get("tiles")
    count = (bounds["maxX"] - bounds["minX"] + 1) * (bounds["maxY"] - bounds["minY"] + 1)
    if not isinstance(tiles, list) or len(tiles) != count:
        raise ValueError("Incomplete map tile inventory")
    seen = set()
    for tile in tiles:
        if not isinstance(tile, dict):
            raise ValueError("Invalid map tile record")
        x, y = tile.get("x"), tile.get("y")
        if (not integer(x) or not integer(y) or not bounds["minX"] <= x <= bounds["maxX"]
                or not bounds["minY"] <= y <= bounds["maxY"] or (x, y) in seen):
            raise ValueError("Map tile identity is invalid or duplicated")
        seen.add((x, y))
        state, marker = tile.get("visibility"), tile.get("marker")
        if (not isinstance(state, str) or state not in {"visible", "fogged", "unknown"}
                or not isinstance(marker, str) or marker not in {" ", "C", "c", "U", "u", "!", "?", "???"}
                or tile.get("terrain") is not None and not isinstance(tile["terrain"], str)
                or state == "unknown" and (tile.get("terrain") is not None or marker != "???")
                or state == "fogged" and marker != " " or state == "visible" and marker == "???"):
            raise ValueError("Inconsistent map visibility or entity evidence")


def render_svg(view: dict) -> str:
    """Render only bounded, already-filtered facts. Never execute markup from labels."""
    _validate(view)
    radius = 36
    positions = [(tile, math.sqrt(3) * radius * (tile["x"] + 0.5 * (tile["y"] % 2)),
                  -1.5 * radius * tile["y"]) for tile in view["tiles"]]
    min_x = min(x for _, x, _ in positions) - math.sqrt(3) * radius / 2
    min_y = min(y for _, _, y in positions) - radius
    content_width = max(x for _, x, _ in positions) - min_x + math.sqrt(3) * radius / 2
    width = max(760, math.ceil(content_width + 80))
    height = math.ceil(max(y for _, _, y in positions) - min_y + radius + 188)
    root = ET.Element("svg", {"xmlns": "http://www.w3.org/2000/svg", "viewBox": f"0 0 {width} {height}",
                              "width": str(width), "height": str(height), "role": "img", "aria-labelledby": "title"})
    ET.SubElement(root, "title", {"id": "title"}).text = f"Sidkick map — Turn {view['turn']}"
    ET.SubElement(root, "rect", {"width": "100%", "height": "100%", "fill": "#0f172a"})
    style = ET.SubElement(root, "style")
    style.text = "text{font-family:system-ui,sans-serif;text-anchor:middle;fill:#e2e8f0}.coord{font-size:9px}.label{font-size:9px;font-weight:700}"
    pattern = ET.SubElement(ET.SubElement(root, "defs"), "pattern",
                            {"id": "fog", "width": "10", "height": "10", "patternUnits": "userSpaceOnUse"})
    ET.SubElement(pattern, "path", {"d": "M0,10 L10,0", "stroke": "#e2e8f0", "opacity": ".3", "stroke-width": "2"})
    def text(parent, x, y, value, **attrs):
        ET.SubElement(parent, "text", {"x": str(x), "y": str(y), **attrs}).text = str(value)
    center = view["center"]
    text(root, width / 2, 31, f"Sidkick map — Turn {view['turn']} — center ({center['x']},{center['y']})", **{"font-size": "22"})
    text(root, width / 2, 57, "North ↑   East →   |   Refresh shows the last tool-generated map; no automatic game queries", **{"font-size": "12"})
    points = " ".join(f"{radius * math.cos(math.radians(angle)):.2f},{radius * math.sin(math.radians(angle)):.2f}"
                      for angle in (-90, -30, 30, 90, 150, 210))
    for tile, x, y in positions:
        group = ET.SubElement(root, "g", {"class": "tile", "data-x": str(tile["x"]), "data-y": str(tile["y"]),
                                         "transform": f"translate({x - min_x + (width - content_width) / 2:.2f} {y - min_y + 96:.2f})"})
        color, label, icon = TERRAINS.get(tile.get("terrain"), ("#293548", "UNKNOWN", "?"))
        state = tile["visibility"]
        names = [str(item.get("name", "")) for item in view.get("settlements", []) + view.get("units", [])
                 if state == "visible" and item.get("x") == tile["x"] and item.get("y") == tile["y"]]
        ET.SubElement(group, "title").text = f"({tile['x']},{tile['y']}) | {label} | {state}" + (" | " + "; ".join(names) if names else "")
        ET.SubElement(group, "polygon", {"points": points, "fill": color, "stroke": "#172333", "stroke-width": "2",
                                         "opacity": ".5" if state == "fogged" else "1"})
        if state == "fogged":
            ET.SubElement(group, "polygon", {"points": points, "fill": "url(#fog)"})
        text(group, 0, -15, label, **{"class": "label"})
        marker = "?" if state == "unknown" else "FOG" if state == "fogged" else tile["marker"].strip() or icon
        if state == "visible" and tile["marker"] in {"C", "c", "U", "u", "!"}:
            ET.SubElement(group, "circle", {"r": "14", "fill": "#b91c1c" if marker == "!" else "#f8fafc", "stroke": "#172333"})
        text(group, 0, 7, marker, **{"font-size": "15" if marker == "FOG" else "21",
                                   "style": "fill:#172333" if state == "visible" and tile["marker"] in {"C", "c", "U", "u"} else ""})
        text(group, 0, 24, f"{tile['x']},{tile['y']}", **{"class": "coord"})
    for index, (color, label, _) in enumerate([*TERRAINS.values(), ("#293548", "UNKNOWN", "")]):
        x, y = 40 + (index % 4) * 180, height - 53 + (index // 4) * 25
        ET.SubElement(root, "rect", {"x": str(x), "y": str(y - 11), "width": "15", "height": "15", "fill": color})
        text(root, x + 77, y, label, **{"font-size": "12"})
    svg = ET.tostring(root, encoding="unicode", xml_declaration=True)
    # Reject invalid XML characters in unexpected native labels before publication.
    try:
        ET.fromstring(svg)
    except ET.ParseError as exc:
        raise ValueError("Native map labels contain invalid XML characters") from exc
    return svg


def publish_preview(view: dict, directory: Path | None = None) -> dict:
    """Replace only our fixed SVG cache atomically, keeping the last good file on failure."""
    svg = render_svg(view)
    directory = PREVIEW_DIR if directory is None else directory
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, prefix=".map-", suffix=".svg", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(svg)
        os.replace(temporary, directory / PREVIEW_NAME)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {key: view[key] for key in ("turn", "age", "playerId", "center", "bounds", "requestedSize", "coverage")} | {
        "previewUrl": PREVIEW_URL, "previewPath": str(directory / PREVIEW_NAME), "previewUpdated": True,
        "projection": "north-up pointy-top SVG", "scope": "Static local preview cache; latest successful tool call wins. No game actions, HTTP game control or automatic refresh. A loopback viewer and SSH tunnel are required."}
