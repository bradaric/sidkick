# Infrastructure, placements and disasters

## Build for the remaining time, not an endless future

**INFERRED strategy:** a production investment is useful only if its cost and lost time are justified by later work **before the relevant deadline**. A rough payback check is `production cost / incremental production per turn`, but that ignores modifiers, scaling, adjacency, replacement losses and the value of earlier science. Use it as a warning against automatic infrastructure stacking, not a complete optimizer.

**OFFICIAL S2:** production buildings no longer contribute to increased cost scaling for future buildings; Food/Production Warehouses also changed type eligibility. The latest descriptions can matter more than older building classifications.

**OBSERVED examples:** Bàakʼ's early Ironworks gave +9 net production and quoted 7 turns; the user purchased it for 2,140 gold, leaving 36 at roughly +220/turn. Copan's Ironworks gave +6 and was deferred until Lab and rail finished; it later quoted 6 turns. Both choices need their own budget/deadline analysis. There is no universal "Ironworks first" rule.

## Placement checklist

1. Query the exact settlement and constructible.
2. Check production availability, quote, purchase affordability and selected location validity separately.
3. Inspect **all displaced assets**, including a second building in a full-tile district and any unique improvements.
4. Compare `netYieldChanges`, not just the new building's base description.
5. Check local net happiness after upkeep. Stored happiness/empire-wide happiness is not a substitute.
6. Preserve specialist-heavy districts or scoring assets unless the trade-off is explicit.
7. Cross-check questionable previews against the settlement inventory and user's UI.
8. Give a recognizable landmark and net-preview fingerprint. Historical coordinates alone are not usable guidance for this user.

**REPO:** placement previews may include engine-reported effects on other settlements. An unusual +science preview for a non-science building is not necessarily an intrinsic yield of that building. In this campaign Aerodrome previews reported +10/+11 science; do not describe all Aerodromes as inherently producing that science.

## Full-tile versus paired buildings

**OBSERVED descriptions:** Rail Station and Aerodrome occupy entire tiles and cannot pair with a second building. StP's Radio Station could fill the second slot beside its Laboratory. Full-tile construction over Bàakʼ's Inn tile also involved a Guildhall there; a single `overbuilds` object could not establish all removals.

**Known extraction trap:** the placement list repeatedly reported `overbuilds: null` at an **existing Obshchina** tile, including StP (21,9) and Bàakʼ (11,4). Null is not a safe statement that the tile is empty. This was observed, not fixed as part of this KB. Report contradictions; do not change the game's state to test them.

## Alchemy and Civil Engineering

**OBSERVED card text:**

- **Alchemy:** when overbuilding a **building**, gain science equal to 25% of the new building's production cost.
- **Civil Engineering:** +30% production toward overbuilding.

Suitable replacements include an obsolete generic building. Empty-slot construction, replacing a rural improvement, ordinary repairs and building Oxford were not established Alchemy triggers. Do not force a bad replacement just to obtain a one-off science reward. Wonders/projects are not automatically overbuilding tasks.

If the last eligible build is one turn from completion, inspect whether removing Civil Engineering delays it. Swap cards deliberately instead of assuming the new policy will be free of timing consequences. Actual preview and current equipped card matter.

## Historical safe/unsafe placement examples

These are **OBSERVED historical previews**, not instructions for a reloaded save:

| City and choice | Observed net preview | Lesson |
|---|---|---|
| Bàakʼ Schoolhouse over Kiln (14,6), T17 | +15 science, -10 food, -6 culture, -1.5 gold, -11.5 happiness | Highest science can have steep local upkeep/losses; compare alternatives |
| Bàakʼ Lab over University (14,6), T22 | +16 science, +1 culture, -1.5 gold/happiness | Modernizing a University can be correct; name does not establish tier strength |
| Bàakʼ Museum over Observatory (13,5), T40 | +12 culture, -4 science, about -0.93 gold/-1.93 happiness | A real science-for-culture trade; specialists were elsewhere; no zero-cost defense |
| Copan Lab over Hospital (25,15), T17 | +19 science, +1 culture, -8 food, -1.5 gold/happiness | Preserved old specialist district and happiness buildings |
| Copan Ironworks over Altar (25,13), T46 | +6 production, +1.38 gold, -3 happiness | Preserved Bank and science; compare changing exact maintenance values |
| Copan Department Store over Temple (25,11), T51 | +6 net happiness, +1 slot, -1.93 gold | Base +12 happiness was not the net gain when replacing a happiness source |
| StP Radio Station beside Lab (18,11), T34 | +9 happiness/+9 influence, +1 science/+1 culture, -3 gold | Empty second building slot; no rural improvement sacrificed |
| StP Aerodrome on Woodcutter (19,10), T52 | +5 production, +11 science, +1 culture; -2 food/-3 gold/-4 happiness | Preserve Obshchina; science is a conditional engine preview, not base building yield |

Don't assume old losses are still affordable after a specialist/policy change. Copan went from comfortable happiness to around +4.8 by T51 after several changes; empire food remained ample.

## Obshchina

**OBSERVED text/previews:** +1 food on settlement Farms, +2 culture if the Obshchina's tile is Tundra; cannot adjoin another Obshchina. It could be placed over an existing improvement. Several previews preserved the underlying yields; that does not justify saying every special improvement is retained.

- Tundra is needed for its culture bonus, **not for all placement**. Copan offered non-Tundra choices.
- Avoid replacing Monasteries: Copan previews explicitly lost 4 science; Bàakʼ's Monastery was also a poor sacrifice.
- Copan's only non-Monastery placement before its station was the Farm later used for the station. Building an Obshchina there first would have been wasted work.
- Additional copies do not add another distinct type for rail Tourism. Farm-bonus stacking across copies was **not verified**; do not assume it.
- **OFFICIAL S2:** repeated Unique Improvements of the same type in the same settlement scale their production cost. Observed Obshchina quotes rose from 200/800 production/gold for a first copy to 300/1,200 for another. Re-query rather than reusing the old price.

## Repairs and disasters

**OBSERVED T17:** Lobster Volcano damaged StP's Mine and Woodcutter; repairs were purchased for 24 gold each before later decisions. Keep vulnerable units away when possible; do not claim a specific future eruption forecast.

**OBSERVED T41:** a Squall Line headed east, with a notification forecasting destruction over two turns. Bank and University in Copan were damaged; the initial notification recorded two population lost and no units killed. Schoolhouse/Lab were intact. T42 reported another tile damaged and one population lost as the storm moved. Do not freeze the first damage total as the whole event.

- Move exposed units out of the actual highlighted path if legal; the tool did not expose precise future storm tiles.
- Delay repairs on still-threatened tiles to avoid paying twice, if the temporary yield loss is tolerable.
- At T41, each Bank/University repair quoted 380 gold or two production turns. Buying both would preserve the Rail Station queue; this was advice, not proof of immediate execution. Later records showed both repaired.
- Lost population must be recovered through the relevant growth mechanics; repairs do not restore it automatically.
- General Moroz II protects against **Blizzards**, not every storm/volcano. Repairs are not Alchemy triggers.
