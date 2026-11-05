# Open questions and corrections

This page prevents a long conversation from becoming a collection of authoritative-sounding mistakes. See [evidence labels](README.md) and [sources](sources-and-evidence.md). Resolve items with current UI/native checks or applicable source evidence, not by repeating an earlier answer.

## Corrections already supported

| Earlier shortcut or claim | Correct handling |
|---|---|
| Current cultural target is the main safety check | Stress-test the next lower multiplier; exact default bands are in official S2 and loaded rows now have tool support |
| We needed to wait to discover when the 2x drop occurred | Published default bands existed; the advisor failed to consult/use them early enough. Loaded rules still take precedence |
| Late recollection: our Modern T1 Tourism was about 105 | T17 was 105 after Oxford +12 and a Celebration +6; 87 is the inferred T1 value. Re-read the actual T1 save |
| Higher culture yield directly raises the defensive bar | Tourism points do; culture can help indirectly via civics/leader effects |
| Radio's project or Research Initiative is direct points on research | Radio II grants +2; Radio Telescope requires production for +5; Research Initiative is ongoing science only |
| Museum always has exactly three slots | Base description was three, but runtime records showed four in Bàakʼ. Bonus cause was not captured |
| Bàakʼ already has a University for the Explorer | Its generic University had been replaced. Oxford's name does not establish ordinary research-action eligibility |
| Excavating Uluru awarded nothing | T42's Wondrous narrative acknowledgement held +1 Artifact; later display/scoring was observed |
| An Explorer crowd proves first-arrival reservation mechanics | It did not establish the exact disabled-action reason. Map tooltip was not the command tooltip |
| Every Natural Wonder hex is a separate find | Loaded civic text says once per player per wonder; check eligible position and prior personal excavation |
| More Obshchinas automatically multiply rail Tourism | The observed rule counted unique improvement **types** in a connected settlement; extra copies are not new types |
| Obshchina requires Tundra everywhere | Its +2 culture requires Tundra; Copan offered legal non-Tundra placements |
| A null overbuild means empty ground | Existing Obshchinas contradicted that reading; cross-check settlement records |
| Social Science can simply replace Alchemy | The actual new card was in ordinary policy availability. Check slot groups; later Civil Engineering was the relevant replacement |
| Any storm is countered by General Moroz II | Its observed protection specified Blizzards; Copan's event was a Squall Line |
| Town production feeds cities' production | It converts into town gold; connected city support concerns food |
| A station proves a rail connection | Check native rail membership and the second/network endpoint |
| An Aerodrome automatically awards +6 Tourism | Flight II's observed effect required Unique Buildings; StP lacked them |
| +11 science in an Aerodrome preview is its base yield | Placement totals can include broader engine effects; base description was +9 production |
| Old generic buildings must always be preserved because of names | Compare obsolete versus Modern net yields and actual specialist upkeep; overbuilding a University can be sensible |
| Government/ideology are interchangeable choices | Separate systems with different prerequisites, chooser state and permissions |
| Interrupted countdown resets to five | Official wording says it pauses/resumes; use native status |
| The loss proves peaceful science is impossible | The run demonstrates an unaddressed timing/lead problem, not the impossibility of every peaceful alternative |

## High-priority unresolved mechanics

### 1. Cultural score removal/transfer through conquest

**Known:** official notes say captured Wonders provide less Tourism than self-built Wonders. **Unknown here:** exact changes to the former owner's score, treatment of static carryover/old-Age awards, Great Works transfer, pillage, razing and recapture. The public `scoringRules.staticCarryover` and arguments are evidence to inspect, not a complete battle/conquest forecast.

**Next evidence:** applicable scoring definitions plus a user-observed before/after in a save they elect to play, or a trustworthy version-matched controlled test. Do not declare war or load/advance a save merely to test this. Do not promise war declaration automatically pauses cultural victory.

### 2. Incorporation and persistent city-state effects

**Known:** selected bonuses and current city-state count are different concepts. Secondary sources report persistence of chosen bonuses. **Unknown locally:** exact Modern incorporation behavior of Professional Architects, Annexation and Zymurgy under the installed rules/settings.

**Next evidence:** applicable modifier requirements or a user-approved/play-driven incorporation with before/after output. The direct wiki fetch was blocked. Do not claim the tool has simulated incorporation.

### 3. Disabled excavation action near Kaan

**Known:** Explorer had 2/2 movement; three Explorer icons were shown; the generic map tooltip said a ruin could be excavated. **Unknown:** exact disabled-command reason and whether another player's ongoing action, position, prior personal use, research or another constraint was the blocker.

**Next evidence:** tooltip on the unit command and current site identity. A later screenshot of a different Natural Wonder does not resolve the original ruin's blocker. Do not convert the advisor's tentative explanation into a universal rule.

### 4. Obshchina stacking and underlying improvement retention

**Known:** several net previews preserved yields; Monastery replacements explicitly lost science. **Unknown:** repeated settlement Farm-bonus stacking and all special-improvement interactions. **Next evidence:** exact loaded modifier/placement requirements and a clear net UI preview. Avoid overstating the "layer" analogy.

### 5. Exact leader/Memento and culture-to-science effects

The campaign used Catherine, Eagle Banner and Antikythera Mechanism; artifact science synergy was discussed. Their full exact current effect formulas were not recorded here. A city-culture penalty might also reduce science through secondary effects. **Next evidence:** current leader/Memento descriptions and net UI comparison. Do not promise a specific per-work science award from memory.

### 6. Remaining space-race route and project identities

**Known:** native 100 Innovation/undamaged Launch Pad requirement; several base/Mastery/building/project prerequisites. **Unknown:** complete fastest research path, later repeatable project identity/requirements, final costs and finish date. Old-style project descriptions can coexist with ToT score rules. **Next evidence:** current technology and `modernProjects` inventory, native BUILD permissions and installed activation requirements.

### 7. Exact replay settings and inherited state

The T1 save was not reopened while making this KB. Difficulty, game version/mod list, transition option labels, full initial scores/resources and all point allocations need fresh verification. Do not infer new RNG, rival build order or a fixed T56 outcome merely because the save name is familiar.

## Lower-priority questions worth retaining

- Oxford's duplicated Industrialization reward: likely base plus Mastery, but not a controlled test of its technology selection.
- Numerical Factory GDP/marginal empire yields and best resource allocation: descriptions and infrastructure checks existed; exact deltas remained unknown.
- Actual +6 Tourism from each Maya-building city's Aerodrome: anticipated, not observed before concession.
- Slot capacity bonuses: base-three Museum/Hermitage versus runtime four; cause unrecorded.
- Natural Wonder identity/path in the final screenshot: it was a candidate, not a recorded second completed find.
- Neutral American Settler destination and legality of interior gap settlement: no hostile-unit tool or current-distance calculation revealed its orders or future founding permission.
- How much the selected science/culture narrative reward actually changed a completion turn after overflow: don't infer an exact saved turn from a 500-point award without an after-read.

## Updating this page

When resolving a question, preserve the original concern, add evidence/turn/version and move the result into the relevant domain page. Say what remains uncertain. A reported fix in a later repository commit is not proof it was present in the earlier campaign's live connection.
