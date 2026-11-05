# Victories and deadlines

Evidence: **OFFICIAL S1/S2**, **OBSERVED T28/T56**, **REPO victory query**. See [sources](sources-and-evidence.md). Native targets and prerequisites for the loaded save take precedence over this reference.

## Four different quantities

| Quantity | Role | Not equivalent to |
|---|---|---|
| Science yield | Researches technologies | Innovation points |
| Innovation | Fixed science-victory score | A rival-relative dominance ratio |
| Culture yield | Researches civics; can feed leader-specific effects | Tourism points or Civ VI domestic-tourist defense |
| Tourism | Cultural victory score | A per-turn culture yield |

Military Dominion and Economic GDP also use dominance. The falling ratio is not a cultural-only advantage. GDP includes accumulating per-turn sources; do not assume all four scores have identical accumulation/removal behavior.

## Default full-campaign schedule

**OFFICIAL S2:**

| Age-progress interval | Ratio to runner-up | Name |
|---|---:|---|
| Exploration 50% to 80% | 6x | Transcendent |
| Exploration 80% through Modern 20% | 4x | Crushing |
| Modern 20% to 40% | 3x | Decisive |
| Modern 40% to 60% | 2x | Momentous |
| Modern 60% to 80% | 1.5x | Substantive |
| Modern 80% to 100% | 1.25x | Narrow |

Treat the **loaded schedule** as the boundary authority; avoid ambiguity about shared endpoints in prose. Modern T28 showed 20% and the 3x result; T56 showed 40% and the 2x result in the conceded run. Alternate starting Ages/previous-Age counts can select different rows. Do not convert these percentages to universal turn dates.

**REPO:** `victoryConditions[].dominanceSchedule` reports `tiers`, `currentTier`, `nextTier`, `startingAge`, `previousAgeCount`, `ageProgressPercent` and an intentionally null `estimatedTurnsUntilChange`. `victoryAlerts` surfaces active countdowns and the next easing. Older tool connections may lack the new fields; missing data is not safety.

## Defensive arithmetic

Let `L` be the leader's current Tourism, `R` the runner-up's score and `m` the applicable multiplier. `m * R` is a useful **scenario calculation**, not a replacement for the engine's native `targetPoints`. The tool omits unmet players, and exact rounding/tie rules should be verified in the UI.

For an integer runner-up score **strictly above** the leader's scaled qualification boundary, a conservative target is:

```text
defensive_score = floor(L / m) + 1
additional_points = max(0, defensive_score - our_score)
```

This assumes we become/remain runner-up. It is a safe-margin calculation at a frozen rival score, not a guaranteed win interruption in future turns. Another runner-up can also raise the bar. If the leader gains points, recalculate.

**OBSERVED T56 example:** L=360, ours=148, m=2. A conservative defensive score is **181**, needing **+33 Tourism**. At that frozen rival score:

| Ratio | Conservative defensive score | Gap from 148 |
|---|---:|---:|
| 3x | 121 | 0 |
| 2x | 181 | 33 |
| 1.5x | 241 | 93 |
| 1.25x | 289 | 141 |

This is why an extra five-point artifact can help at one tier yet not solve the next. At 3x, +5 to the actual runner-up raises the scenario threshold by 15; at 2x it raises it by 10. Neither is an empire-wide +5/turn income.

## Countdown semantics

- **OFFICIAL:** qualifying starts a five-turn countdown; loss of qualification pauses it and it resumes later. Do not promise a reset to zero.
- **REPO:** countdown turns remaining are conditional on continued qualification, not an unconditional future defeat date. Null countdown values remain unknown.
- **OBSERVED science prerequisite:** 100 Innovation and an **undamaged Launch Pad**, followed by the five-turn countdown. Inspect the actual native prerequisite, not only generic guide wording.
- A capital capture or declaration of war is not an established universal cancellation rule for cultural dominance.

## Check before each consequential commitment

At session start, after several user-advanced turns, near an Age-progress boundary, after a large scoring event, and before a long build:

1. Read native targets/countdowns for **all enabled victory types and met rivals**.
2. Read the applicable current/next tier; stress-test today's scores at the next lower multiplier.
3. Identify the required defensive points and a margin for rival scoring bursts.
4. List only scoring actions whose unlock, construction, travel and display steps can plausibly finish before qualification/countdown completion.
5. Compare with a **complete** science finish path: missing Innovation, research, project production, Launch Pad and its countdown. If unknown, do not assert that science will beat the timer.

Suggested judgment, not a game rule: if the rival already qualifies under the next tier and our committed work cannot close that gap by the boundary, flag **strategic danger now**, even with no current countdown.

## Active-countdown triage

Pause normal infrastructure recommendations. Ask the user to preserve a save before advancing if they want options. State the exact known deficit and conditional time window.

- Count guaranteed/verified near-term scoring, not optimistic stacking. Inspect purchase price, affordability and legal placement before spending.
- Culture buildings, Cultural Festivals and Hinder Civic Study affect culture, not automatically Tourism.
- A rushed Aerodrome's +6 expected Tourism does not close a +33 deficit by itself. Say so.
- Military action needs a separate, evidence-led feasibility assessment and user buy-in. Captured Wonders provide reduced Tourism (**OFFICIAL S2**), but exact subtraction from the former owner's historical scores is unverified here.
- If no credible timely response is established, say that clearly. Offer continuing, conceding or revisiting a save without claiming a miracle or forcing a style change.
