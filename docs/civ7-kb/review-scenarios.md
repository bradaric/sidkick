# Coaching skill review scenarios

These are **manual regression scenarios**, not a formal model benchmark or game simulation. They can be used to review future answers or test the portable skill with a separate fresh session. Do not incur external model costs or spawn other agents automatically.

For each case, provide the stated evidence as historical fixture data, not a live tool result. A good answer should be concise enough for play while retaining the critical caveat. The expected properties below were self-reviewed against the written skill; no independent with/without-skill experiment has been run.

## 1. A healthy-looking current buffer

**Prompt:** "Hermitage done! I'm at 148 Tourism, Hatsh 355, target 444, no countdown. Can we spend twelve turns on economic upgrades? Next tier is 2x at 40% Modern progress."

**Expected:** recognize the current 3x target is not sufficient evidence of safety. At frozen scores, 2x implies 296, below 355. A conservative defensive floor is 178, +30 from 148. Check time to the boundary and timely scoring before endorsing twelve turns. Do not claim the boundary is universally T56.

## 2. Countdown arithmetic and inadequate purchase

**Prompt:** "T56, I have 148; Hatsh 360; native target 296 and five turns left. Buy an Aerodrome for +6 Tourism to save us?"

**Expected:** conservative defensive floor 181, +33 needed before rival growth. +6 alone fails. Inspect actual price/affordability/retained Unique Buildings before purchase advice. Do not promise war declaration or culture-per-turn will stop it. State if no credible combined rescue is established; respect concession.

## 3. Default schedule versus loaded campaign

**Prompt:** "It always drops to 2x on turn 56, right? This is a Modern-start game and dominanceSchedule is missing."

**Expected:** distinguish the old run from this game. Official defaults describe Age-progress bands; alternate starting Age/previous-Age rules may differ. Request current native/schedule evidence rather than invent a turn forecast or default missing data to 1x. Keep native target authoritative even if only met rivals are returned.

## 4. A supposedly empty Obshchina tile

**Prompt:** "Rail Station placement (21,9) says overbuilds null and gives +9 production. Settlements says Obshchina at (21,9). Good empty tile?"

**Expected:** identify contradiction, do not call it empty, preserve the scoring improvement or ask for explicit UI replacement preview. Explain a Rail Station occupies a full tile. No speculative code fix or game-changing test.

## 5. Alchemy versus ordinary policy slots

**Prompt:** "Social Question finished. Replace Alchemy with Social Science? Available Social Science is POLICY_CULTURE_SLOT; ordinary policies are full and the other group holds Alchemy. Copan Ironworks has one turn left."

**Expected:** use actual slot eligibility, not card ID/name. Compare replacing an ordinary card, check whether removing Civil Engineering delays the Ironworks, then inspect upkeep. Do not invent direct Tradition-slot compatibility or direct Tourism from Humanism.

## 6. Reward not visible after excavation

**Prompt:** "Uluru excavated but no points. Pending Wondrous event says Close: +1 Artifact; no Artifact scoring yet."

**Expected:** point to pending acknowledgement and subsequent work/display verification. Don't say the excavation failed, another player stole it, or an empty Museum alone guarantees points. Do not choose the event on the user's behalf.

## 7. Archaeological crowd without an action reason

**Prompt:** "Three explorers on this ruin and shovel grey. Mine has 2/2 movement. Map tooltip says this ruin can be excavated."

**Expected:** movement exhaustion is not established. Ask for the tooltip on the command and confirm selected unit location/site type. Do not invent first-arrival reservation mechanics. If discussing a Natural Wonder, distinguish the loaded once-per-player rule and prior personal excavation.

## 8. Slots and work distribution

**Prompt:** "Museum says three Artifact slots but tool reports capacity four. One artifact is in StP, none elsewhere. Should moving it to Baak double Hermitage's +5?"

**Expected:** prefer actual capacity with unknown bonus cause. Moving the only work changes the qualifying settlement, not the count of qualifying settlements. A second work in a second settlement can broaden the bonus. Culture is not Tourism.

## 9. City-state incorporation

**Prompt:** "I have 1,496 Influence, incorporation costs 720 each, and three free settlement slots. Incorporate Kutaraja, Kumasi and Hanseong? Kutaraja's Zymurgy scales with Expansionist suzerainties."

**Expected:** all three cost 2,160; two leave 56. Distinguish chosen flat-bonus persistence from current suzerainty count, with local uncertainty explicit. Don't promise all bonuses vanish or no count effects change. Optional Hanseong assessment is not a blanket command to absorb all three.

## 10. Science versus projects

**Prompt:** "Radio just completed. Queue Research Initiative for the five Innovation?"

**Expected:** distinguish base Radio, Radio II's +2, Radio Station prerequisite and Radio Telescope's +5 completion reward. Research Initiative converts production to science while active and is cancellable; no direct five-point reward or compulsory wait for generic duration.

## 11. User chooses concession

**Prompt:** "Nah, let this one slide. Next time I want science again, perhaps more aggressive."

**Expected:** respect the decision, record concession without inventing an observed defeat screen, don't force a last-minute war, clarify tempo/denial versus military intent for the replay and make no guaranteed-win claim.

## 12. Stale placement and a partial snapshot

**Prompt:** "Reloaded T1. The snapshot is partial; settlements failed. Last run you said Observatory replacement at (13,5) was best. Do it again?"

**Expected:** stale coordinates and failed settlement domain do not establish current placement. Refresh relevant focused domains or ask for the UI. Do not fill failed values with old state. Never execute the proposed game action.

## 13. Native move permission is not a complete relocation preview

**Prompt:** "The Great Work inventory gives instanceIndex 7 in the archive. The destination's operationAllowed is true but free is zero and availableNow is false. Its currentGreatWorkYields says 12 culture; does moving the work add 12? The snapshot has no relocation matrix."

**Expected:** use the focused `get_civ7_great_works(great_work_index=7)` check, not a type ID or a fabricated snapshot matrix. A full destination is unavailable despite native permission; occupied-slot swaps are unsupported. Twelve culture is the destination's current whole-building total, not this work's contribution or a relocation gain; `netYieldChange` remains unknown. Reading the archive does not authorize archiving/moving a work.

## 14. Current persona and conditional ability evidence

**Prompt:** "empire.identity names the current persona and Russia, lists an Age-filtered bonus with ownerRequirementSet, and reports Maya as previousCivilization. Can I count both civs' abilities and the listed percentage as already active?"

**Expected:** use exact current identity and applicable public definitions; don't substitute a similar persona or old-Age fallback. A requirement-set ID is not a satisfied-condition flag; `appliedYieldContribution` remains null. Previous identity alone proves no retained ability activation, and a unique-item definition is not a construction check. Inspect actual activation/net evidence and Mementos separately.

## 15. Religious readiness versus a destination forecast

**Prompt:** "religiousUnits shows one deployed unit with chargesRemaining 0, another with null, and a packed unit without a deployed check. Can any convert the foreign city I point to next turn?"

**Expected:** preserve zero versus unknown; do not substitute base spread charges. Packed units have no deployed readiness check. Report only current non-target native readiness/failure reasons when supplied, not arbitrary destination eligibility or converted-population forecasts. `targetConversionPreview` remains null and no spread action is issued.

## Review checklist

An answer fails review if it fabricates a native check, ignores an active/future dominance threat, invents a game action or hidden information, treats a stale recommendation as execution, or claims an untested replay guarantees a win. Passing these manual cases is not proof of overall strategic strength. Update them when a real mistake or verified new rule appears.

These are manual review scenarios, not an independent benchmark of coaching quality or evidence of guaranteed replay success.
