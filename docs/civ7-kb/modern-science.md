# Modern science: yields, Innovation and projects

Evidence: **OBSERVED campaign unlock descriptions/availability**, **OFFICIAL S1/S2**. Costs and turns below are examples from the conceded run, not permanent prices. Refresh the loaded technology tree and native project availability.

## Work backward from the finish

The scientific finish observed here was **100 Innovation + an undamaged Launch Pad + the five-turn countdown**. Another player's Innovation does not raise that target. A large science yield only helps research; it is not itself progress on every requirement.

For each candidate source of Innovation, record:

```text
Points still needed:
Technology/Mastery prerequisite and current research time:
Required building and city-local versus empire-wide scope:
Building placement/cost/time and lost assets:
Project cost/time after that building:
Once-per-civilization limit or repeatability:
Earliest supported completion estimate and uncertainty:
Rival victory deadline it must beat:
```

Parallelize research and prerequisite construction when it is actually possible. Do not add every historical turn quote mechanically: growth, modifiers, purchases, placement and scaled prices change the result. Do not claim a complete space-race forecast when later research or construction requirements are unknown.

## Observed technology choices

| Technology | Observed effect | Strategic distinction |
|---|---|---|
| Urbanization | Department Store (+12 happiness, +1 resource slot), Opera House (+12 culture, +6 influence) | Unlocking support buildings is not itself a happiness or Tourism increase |
| Urbanization II | +1 population in every city; +1 settlement limit; Modern Bridge | Attractive small research investment, but new specialists still need upkeep; no direct Innovation in the observed unlock list |
| Computation | -1 happiness maintenance per specialist; Stock Exchange | Upkeep reduction does not require building Stock Exchanges; actual savings depend on modifiers |
| Combustion | Cruiser, Dreadnought, Landship and a Cossack tier | A forward tech-tree step, not a peaceful immediate-yield unlock in its observed base list |
| Combustion II | +2 Innovation; +3 cavalry strength | Direct small-point pickup; compare against delaying later unlocks |
| Radio | Radio Station | No automatic five-point award from base research |
| Radio II | +2 Innovation; Radio Telescope project | Project points require separate production and a Radio Station |
| Flight | Aerodrome, Squadron Commander, air units | Aerodrome gives base production and enables projects, not an automatic Innovation payout |
| Flight II | Trans-Oceanic Flight; fighter intercept range; +3 Tourism on Unique Buildings in Aerodrome settlements | Science and Tourism cross-over; Tourism is conditional on the actual buildings |
| Mass Production | Factory (+12 production, +1 slot, Factory-resource assignment), Cannery (+9 food, +10% growth plus Fish adjacency) | Economic/production investment; not proof of a faster victory than taking a cheap Mastery |
| Mobilization | Aircraft Carrier commander, Battleship, Destroyer | Primarily military in the available list; do not invent a peaceful passive benefit |

**OBSERVED:** by T52, Flight II quoted 3 turns and Combustion II 2. At T55, Combustion II quoted 3 and Mass Production 6. Even adjacent-turn quotes changed; use current values rather than memorized ones.

**Correction:** the original run favored several infrastructure technologies while lacking a credible full victory forecast. The replay should not treat the above order as an optimal route. In particular, a blanket "Mass Production before a cheap +2 Innovation" rule has not been established.

## Project prerequisite ledger

These were reported by live loaded definitions and native checks during this campaign; verify them again under the current rules.

| Project | Required research | Required building in producing city | Reward / limit |
|---|---|---|---|
| Radio Telescope (`PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`) | Radio II | Radio Station | +5 Innovation; once per civilization |
| Trans-Oceanic Flight (`PROJECT_TRANS_OCEANIC_FLIGHT`) | Flight II | Aerodrome | +5 Innovation and a Squadron Commander; once per civilization |
| Break The Sound Barrier (`PROJECT_BREAK_SOUND_BARRIER`) | Aerodynamics II | Aerodrome | +5 Innovation, +1 air-unit strength; once per civilization |
| Launch Satellite (`PROJECT_LAUNCH_SATELLITE`) | Rocketry, depth 1 in the observed definition | Launch Pad | +5 Innovation, map reveal; once per civilization |

The historical project query also returned **Crewed Space Flight** (`PROJECT_LAUNCH_ROCKET`) with an old-style "win a Scientific Victory" description and Legacy Path requirement. **Do not substitute that description for the native ToT victory conditions.** The official guide mentions a later repeatable Innovation project, but its exact loaded prerequisites and applicable project identity were not established in this run.

Actual available-project BUILD checks are stronger than assumptions about a familiar real-world tech chain. A project absent from a compact decisions list may be blocked; use the victory tool's broader `modernProjects` evidence to inspect why.

## Research Initiative is not an Innovation project

**OBSERVED description:** while active, Research Initiative generates science equal to **25% of city production per turn**. It can be cancelled. The displayed generic project turn quote is not a requirement to wait before changing production, and does not mean an Innovation prize will arrive on completion.

It is a useful temporary option when an important building unlock is one turn away, or when current construction alternatives do not pay back in time. Inspect actual yield changes; do not blindly calculate final science by multiplying a possibly modified production total.

Cultural Festival is the analogous culture conversion. It is not an established direct-Tourism emergency button.

## Russia's three-city engine

**OBSERVED effects:**

- Prosveshchenie: culture from city Quarters, additional science in Tundra cities; town Farms receive food and extra production in Tundra towns; +30% production toward Hermitage.
- Krestyanskaya Reforma II: +20% production in Tundra cities, +15% elsewhere, -15% city growth rate.
- Zapadnichestvo II: +20% science in Tundra cities, +15% elsewhere, -15% city culture.
- The owned Scientific attribute made three cities attractive for specialist science. Re-read its exact eligibility before adding a fourth city; more towns did not automatically mean more cities.

Bàakʼ and StP were Tundra; Copan was Desert. Being the capital was not required for Russia's Tundra city effects. Strong town food let cities pay more specialist upkeep, but food did not solve their local happiness constraint.

Culture can also feed leader-specific science effects. Do not dismiss a culture penalty as harmless to science without inspecting Catherine's current abilities and the net preview. Eagle Banner/Great Work synergy was discussed, but its exact current formula was not verified here.

## Historical successes and uncertainty

- Academics came free from a Dedication. Steam Engine, Electricity, Military Science and Electricity II were researched; Electricity II's +2 Innovation was observed applying automatically.
- Oxford at T17 produced a duplicated Industrialization notification. Rail Stations appeared and Industrialization II ceased being available. Record the likely free-Mastery inference without treating it as a universal Oxford reward sequence.
- Scientific building-maintenance perk allocation used the user's UI preview of +11 gold/+8 happiness. Later policy previews showed similar numbers; do not assume these are the same effect or add them twice.
- At T33 the directly read Innovation score was 60; Radio Telescope was completed by the T51 production observations. Re-read the actual score rather than constructing a current total from remembered awards.
