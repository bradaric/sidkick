# Archaeology, Great Works and Tourism

## Tourism is a defensive requirement, not necessarily a victory pivot

**OFFICIAL S1/S2:** Tourism comes from scoring assets/actions such as Wonders, Natural Wonders, Great Works, unique infrastructure and Celebrations, subject to rules and unlocks. It is not synonymous with culture yield. To pursue peaceful science, build a sufficient Tourism floor before a rival qualifies at the next dominance tier.

**OBSERVED:** Hermitage and Oxford each added 12 Tourism in this run. Uluru's displayed Artifact added 5. These were ledger entries, not per-turn Tourism yields or universal totals for every possible work/Wonder.

## Two different archaeological activities

| Ordinary dig sites | Natural Wonder excavation |
|---|---|
| Base Natural History unlocked Explorers and ordinary archaeology | Natural History II enabled excavation on or adjacent to Natural Wonders |
| Use Research Artifacts at a University or Museum to reveal relevant sites on that continent | Observed civic text: each player can do this once per Natural Wonder |
| Competing Explorers can make a site race time-sensitive; inspect the exact action status | Someone else's excavation does not, according to the loaded text, consume your personal allowance |
| A continent's remaining Exploration Artifact count describes ordinary opportunities | Zero in that count does not establish that every Natural Wonder opportunity is exhausted |

**OBSERVED descriptions; not a complete UI-action simulator.** Movement, eligible position, previous personal excavation, borders and the exact action check still matter. The rule says once per wonder, not one award per highlighted hex of a multi-tile wonder.

### The correct action sequence

1. Confirm Natural History or its Mastery is actually complete. A research recommendation is not a completed switch.
2. Recruit an Explorer where it can reach the relevant research location/site promptly. Purchased units may have zero movement that turn; the Bàakʼ Explorer did at T28.
3. For ordinary sites, perform the research action at an eligible **University building or Museum**. An **Oxford University Wonder is not established as a substitute**. Bàakʼ had already replaced its old University, so the earlier "you have Universities" advice was misleading locally. Copan still had one.
4. Move the selected Explorer to an eligible excavation position and inspect the exact command tooltip. A highlighted destination is not proof the unit is there.
5. Complete the excavation, then inspect pending narrative events. Do not assume an apparently empty reward means excavation failed.
6. Claim the reward and verify it appears in Great Works storage/display and in the victory ledger when applicable. Use `get_civ7_great_works` for owned displayed/archive inventory and confirm in the UI when evidence differs; an empty settlement list is not always a complete inventory.

### An unavailable excavation can already be running

**OBSERVED in later save checks:** at Modern T56, the Explorer at (27,37) had 0 movement and its excavation start check returned false without a reason. A separate native diagnostic showed active `UNITOPERATION_EXCAVATE`, queue size 1 and raw `operationTimer: 0`. At T57, `get_civ7_archaeology` returned **"Excavation will be complete in 4 turns."** in the excavation entry's `failureReasons`; a separately loaded T60 save returned **"Excavation will be complete in 1 turn."** These are historical quotes, not a universal duration or proof of a continuously observed sequence.

- `availableNow: false` can mean another excavation cannot start because one is underway. Always inspect `failureReasons`.
- Missing reasons at zero movement, a disappearing button or no visible UI timer do not prove failure. Do not repeatedly recommend reloading solely on that evidence.
- Raw `operationTimer: 0` was not a usable remaining-turn count. The focused tool exposes start checks/messages, not the diagnostic's active-order/queue fields or a structured countdown. Without a native completion quote, leave progress unknown.
- Disabled **Research Artifacts** is a separate check and does not by itself block Natural Wonder excavation. Check pending narrative rewards and owned works after completion. The older Palace artifact does not prove a second dig awarded anything; that second reward remained unconfirmed.

### What happened at Uluru

**OBSERVED T42:** pending event `ARCHAEOLOGY_14A`, **Wondrous**, described the survey of Uluru. The acknowledgement **Close** had the reward **+1 Artifact**. Our Tourism was still 128, with no Artifact scoring entry yet. Later StP's Palace contained an **Exhibit**, and Tourism included +5 for Artifacts, taking us to 133.

The event needed acknowledgement. The advisor correctly diagnosed this only after querying pending events. Add that check early when a user says an excavation gave nothing.

### The crowded-site mistake

The screenshots near Kaan showed three Explorer icons, a grey excavation action and a generic **map** tooltip saying the ruin could be excavated. The user reported Americans arriving first and us third. That did **not** establish the exact disabled-command reason through Sidkick.

Do not infer a universal reservation rule, multiplayer stacking rule or Natural Wonder exception from those icons. Ask for the tooltip on the **unit's excavation command**, not the tile. Distinguish a different later Natural Wonder screenshot from evidence about the earlier ruin. The precise earlier blockage remains unresolved.

## Slots and displaying works

**OBSERVED base descriptions:** Museum +9 culture and 3 Artifact slots; Hermitage 3 Great Work slots; Palace showed 2 slots. By T53 the tools reported **4 slots each** for Bàakʼ's Museum and Hermitage. The extra capacity's cause was not verified; use actual UI capacity instead of insisting every Museum has exactly three.

A Museum is not automatically good defense if no work will arrive before the rival deadline. Budget research, recruitment, travel, excavation, event acknowledgement and display as a pipeline, not separate unrelated tasks.

### Check a proposed relocation

**REPO `d6892b5`:** call `get_civ7_great_works` without arguments, then pass the owned work's `works[].instanceIndex` as `great_work_index` to inspect destinations. Check `availableNow`, source/destination damage, free capacity, `alreadyHere` and failure reasons. Native permission alone does not make a full, damaged or identical destination eligible. Archived works are included; swaps and archiving actions are not modeled.

`buildings[].currentGreatWorkYields` reports current **whole-building** Great Work yields. It is not a single work's effect or the gain from moving it; `netYieldChange` stays null. The query is separate from snapshots' settlement inventories and never moves a work. It can narrow placement choices, but does not by itself settle Catherine/Memento yield attribution, the historical extra-slot cause or the Tourism change from a move. No live relocation was tested in this KB update.

## Hermitage

**OBSERVED description:** +4 culture; **+5 culture in each settlement with a displayed Great Work**; 3 base Great Work slots; Tundra placement; Russian production bonus. At T53 completion, it also scored +12 Tourism.

- The culture effect is **per qualifying settlement**, not per individual work.
- A second new work displayed in a second settlement can broaden the culture benefit. Merely moving the only work from StP to Bàakʼ does not create two qualifying settlements.
- The culture bonus is not itself +5 Tourism and is not proof of a science multiplier. Re-read applicable leader/Memento effects.
- After Hermitage finished, Bàakʼ had an empty Museum and empty Hermitage; StP held the Uluru exhibit. More storage alone did not solve the imminent 2x problem.

## Industrialization II and rail Tourism

**OBSERVED unlock/scoring evidence:** +3 Tourism for each **type of Unique Improvement in a rail-connected settlement**. Monastery and Obshchina were different types. Two Monasteries in one settlement were not treated as two different types.

- Build one valuable qualifying type rather than automatically spamming copies for Tourism.
- A station is not itself proof of a rail connection. Confirm native `inRailNetwork`, and check the scoring ledger after the connection is made.
- At T56, the ledger contained +3 entries for two Monastery records and two Obshchina records alongside earlier +1 entries. This is evidence of a realized scoring change, not a promise that any future station scores the same amount.
- A new Obshchina can make sense for a new type in another connected settlement, but compare its price, replaced improvement and rail timing.

## Flight II and Aerodromes

**OBSERVED unlock:** settlements with an Aerodrome gain **+3 Tourism on Unique Buildings**. This is different from rail's Unique **Improvement** rule.

- Copan and Bàakʼ retained **K'uh Nah + Jalaw**. On that evidence, +6 Tourism from an Aerodrome in each was a plausible prospective calculation. **Neither city's realized Flight II Tourism award was observed before concession.** Check activation, preservation of both buildings and the ledger after construction.
- StP had no qualifying Unique Buildings in the inspected districts. Its Obshchina was an improvement, not a building. StP's Aerodrome was for Innovation projects/production, not that +6 Tourism calculation.
- An Aerodrome occupies a full tile. Sacrificing the very Unique Buildings being counted invalidates the projected bonus.
- At T56, buying Bàakʼ's unfinished Aerodrome cost 3,676 gold while the treasury was 2,235. Even if obtainable soon, +6 alone did not cover the +33 conservative defensive deficit.

## Useful versus misleading cultural actions

- Useful: scoring Wonders, securing/exhibiting works, qualifying infrastructure and Celebrations whose scoring unlock is active; inspect actual `scoringRules` and the ledger.
- Conditional: a Museum, Explorer or culture research detour only helps before the deadline if the whole pipeline can finish.
- Misleading as direct defense: Humanism, Opera House, Cultural Festival, Cultural Exchange or Hinder Civic Study **merely because they change culture yield**. They can help civics or secondary abilities but are not direct substitutions for Tourism.
