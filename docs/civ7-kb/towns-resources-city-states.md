# Towns, resources, trade and city-states

## Town focus: compare the actual tile inventory

**OBSERVED descriptions:**

| Focus | Direct effect in this run | Good reason to choose |
|---|---|---|
| Growing Town | +50% town growth | Still developing territory or pursuing a valuable next resource |
| Mining Town | +2 production on Camps, Woodcutters, Clay Pits, Mines, Oil Rigs and Quarries | Immediate income from many qualifying tiles |
| Fishing Town | +1 food on Farms, Pastures, Plantations and Fishing Boats | Support connected cities when their growth/maintenance needs more food |
| Hub Town | +1 influence per connected settlement; one per continent | Good connection count and an available continent slot |
| Urban Center | +1 science/culture on Quarters; enables certain science/culture purchases | Actual developed quarters or a justified purchase plan, not merely the science label |
| Resort Town | +1 happiness/gold on Appealing tiles; +50% Natural Wonder tile yields | Verified qualifying terrain/wonder yields; **not automatically Tourism from focus alone** |
| Trade Outpost | +1 happiness per resource tile; +5 trade range | Many resources or a real range bottleneck |
| Fort Town | Healing/fortification support and fortified-district gold | A specific defense/logistics need |

Town production is converted into **gold**. It is not a stream of production exported to a city. Specializing stops ordinary local growth in the observed system. Food is sent to connected **cities**, not other towns. Do not recommend more exported food when the local network has no city recipient.

**REPO limitation:** focus `netYieldChange` is null. Count qualifying completed, undamaged improvements for a base comparison and inspect the user UI. `reportedFoodPerConnectedCity` is current evidence, not a marginal preview or a guarantee that a currently Growing Town is exporting that amount. Some generic production records exist for towns even though towns cannot normally produce builds; do not tell the user to queue those items.

### Historical focus decisions

- Ur, Chichen Itza and Kaan: Mining offered about +12 base production each; Roskilde, Tikal and Yaxchilan about +10 each.
- Wak Kab'nal: Hub; Mamallapuram: Farming/Fishing-type food support; Uxmal: Fishing. Historical shorthand is not proof of today's exact project name.
- Yokib T23: six qualifying Farm/Fishing Boat tiles, **+6 base food** from Fishing. Connected to Copan and Bàakʼ. The user initially counted five, then confirmed six. This was deliberately chosen over more local island growth.
- Kyiv T39: three Woodcutters versus one Farm/two Fishing Boats. Mining meant +6 base production converted to gold; Fishing only +3 food. Its returned connections were Ur and Kaan, both towns, so no verified science-city food recipient. Mining was recommended; selection was not confirmed in that exchange.
- Nijni-Novgorod T53: two Woodcutters versus one Farm/three Plantations. Mining offered +4 production/gold; Fishing +4 food. Tobacco had been secured, completing the earlier expansion goal. Mining was recommended; keep Growing if a further territorial/resource goal remains.

Counts and decisions are historical. Empty growth options when no population is pending do not prove the town has no future valuable tiles.

## Growth choices: value the resource and the next step

Use `growth.readyToPlacePopulation` and legal expansion options; separate them from special-improvement previews. A tile's yield count alone misses an assignable resource, a route to another resource, or a specialist's upkeep burden.

**OBSERVED examples:**

- Nijni's northeast Woodcutter (34,27) gave +1 food/+1 production/+1 science/+2 happiness and opened toward Tobacco (35,28). The user's territorial plan was reasonable despite a Cowrie option's better immediate resource payoff.
- Astrakhan later claimed Cowrie (47,32), whose tile preview was +1 food/+1 gold/+1 happiness and whose assignable resource could produce town science; it also developed toward Coal. Future Coal access/eligibility was not a guaranteed next-turn action.
- Kyiv's Farm (22,38) preview was +1 food/+2 production/+1 culture/+1 happiness. Production became town gold; the Woodcutter alternative had more food/happiness.
- Yokib's Reef Fishing Boat (32,15) offered +1 food/+1 production/+1 science; the 1/1/1/1 Farm offered food/production/gold/happiness instead. Both were modest development choices, not hidden victory-point windfalls.

Keep coordinates as identifiers only. The user cannot see them readily; use a landmark or ask for the placement screenshot.

## Resource effects seen in Modern

**OBSERVED descriptions; base effects, not final marginal deltas:**

| Resource | Reported effect |
|---|---|
| Pearls | +8 happiness in capital, +4 in another city |
| Ivory | +4 happiness, +4 production |
| Whales | +8 production |
| Wine | +4 food, +4 production |
| Cowrie | +6 gold in a city or +4 science in a town |
| Spices | +4 food, +4 happiness |
| Gold / Silver | Empire resources; no ordinary settlement slot required |
| Coffee | Factory resource: +5% building/Wonder production |
| Quinine | Factory resource: +1 unit healing |
| Tin | Factory resource: +3% growth |

Factory-resource effects require appropriate infrastructure/network/assignment. More ordinary slots or owning a copy does not activate them. A Factory permits one **resource type**, not arbitrary mixtures. Exact allowed quantities, assignment and empire-wide marginal effects need current checks.

**Historical allocation, T17:** Copan Pearls/Ivory; Bàakʼ Whales/Ivory; StP two Pearls/two Whales; Roskilde/Tikal Cowrie; Uxmal Spices; Kaan Wine; Nijni Sugar; Astrakhan Whales. Later assignments changed. Never apply this table blindly to a reload.

Metropole was initially weak because the extra ordinary spare resource was only one Pearls; Tin/Coffee/Quinine were not ordinary-slot solutions. Reassess when trade provides a genuinely useful waiting resource.

The four Distant Lands towns in the recorded roster were **Tikal, Uxmal, Yokib and Astrakhan**. Nijni was Homeland. These tags mattered for town-culture and Yeomanry estimates; geography on the screenshot alone is not the effect's classification.

## Rail, Factories and trade

**OBSERVED descriptions / REPO evidence:**

- Rail Station: base +9 gold/+9 production, gold adjacency from Quarters, whole tile. On construction it upgrades roads to settlements that also have stations. A single station is not proof of a completed rail link.
- Use `railStationPresent`, `inRailNetwork` and `landConnectedToCapital` as distinct fields. Confirm scoring and Factory eligibility after construction; don't infer every route from nearby map art.
- Factories require Mass Production and the relevant capital rail connection in this run. Native `construction.factory` checks are stronger than assuming any station-equipped settlement qualifies.
- Two Buganda routes were established, apparently to Men-nefer (Ivory/Whales) and Per-Atum (Tin/Gold/Silver). Exact marginal route income was not reconstructed. A partner's `exports` gold is not necessarily our income.
- A route-level available quote is not a Merchant-specific permission. Target eligibility, movement and actual route execution remain separate.

## City-state bonuses

**OBSERVED T48 choices and selections:**

| City-state | Selected bonus | Consequence |
|---|---|---|
| Kutaraja, Expansionist | Zymurgy | +3 food per Expansionist city-state we suzerain in settlements, doubled in towns |
| Kumasi, Expansionist | Annexation | +1 settlement limit |
| Hanseong, Scientific | Professional Architects | +25% production to projects in cities with a Science Building |

With two Expansionist city-states, Zymurgy described +6 food per city and +12 per town. For 3 cities/13 towns the early **base estimate** was 174 food before distribution/modifiers. This explained why yet another small food improvement was often less urgent, but did not remove local happiness constraints.

Other Hanseong choices included Institute (unique science improvement, +5 science and adjacency effects), Artisan's League (+2 science on Science Buildings), Scholarly Network (+5% building production per Scientific city-state), Anthropology (one unspecified free tech), Refineries and Mechanization. Professional Architects suited the anticipated project programme, **not** Hermitage/building construction. Its actual saved turns depend on the full modifier context; +25% production does not mean exactly 25% fewer turns.

## Incorporation: keep two questions separate

1. Does the selected flat bonus persist after incorporation?
2. Does a bonus recalculate from the number of **currently suzerained** city-states?

Secondary sources suggest chosen bonuses can persist, while count-based effects lose the incorporated state from their count. **Not locally tested in this Modern run**; S4's direct page retrieval was blocked. Do not promise that every selected bonus disappears, or that Zymurgy keeps its count unchanged.

The conservative advice was to retain Kutaraja/Kumasi for the count-based food synergy and assess Hanseong separately as an optional town. Removing one of two Expansionist states would be expected to halve Zymurgy's per-existing-settlement benefit if that count behavior applies; a whole-empire total also changes when a new town is added.

At T48 we had **16/19 settlements**, **1,496 Influence**, **+60/turn**, and **720 Influence per incorporation**. Two would leave about 56; all three required 2,160. Having three empty settlement slots did not make three simultaneous incorporations affordable or necessary. An incorporation produces a town; converting it into an extra city is another consequential choice.
