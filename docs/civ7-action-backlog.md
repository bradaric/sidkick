# Civ VII action backlog

Current implementation/verification split, reconciled **2026-11-17**.
This is a status list, **not authorization** to mutate a game, load saves,
advance turns, install tools, change host configuration or commit work.

See the [catalog](reference/action-tools.md) for all **129 registered actions**,
[coverage](civ7-coverage-audit.md) for boundaries, and the
[historical implementation log](history/action-implementation-log.md) for exact
native evidence and prior agreements.

## Completed since the original Group 1 closeout

The Nov 7 Group 1 closeout was a **bounded no-additional-setup milestone**, not
completion of all gameplay or positive-live validation. Its 104-writer count
and deferred list are historical. Subsequent implemented work includes:

- Civilopedia lookup, expanded map previews/ownership/health evidence, ordinary
  fog-capable movement, Scout automation and Send Merchant dispatch.
- First-meet modifier handling, advisor/town-focus/espionage/Triumph acknowledgements,
  paid Call to Arms neutrality and native response/permission fixes.
- Explicit local save/load and ordinary Begin; full guarded Age-transition workflow,
  deck edits/effects, Mementos and capital handling, with a clean transition replay.
- Syncretism selection, capped repair purchases, befriending support, custom
  religion names/lifecycle checks and repeatable attribute purchases.
- Multi-term peace draft editing/native inspection/combination search, alongside
  existing narrower white-peace/economic/single-city workflows.

Implemented does not mean positively live-verified; the table below retains gaps.

## Remaining implementation / API work

| Item | Actual gap / prerequisite |
| --- | --- |
| Unit/captive/technology deal variants | Not implemented; needs actual eligible offers with safe exact item identity |
| Additional Great People/mandatory-choice variants | Only documented fixed profiles/handlers exist; requires exact native contract and representative pending choice |
| Session-only first meet | Unsupported without the notification identity required by the current writer |
| Reusable post-victory continuation | No general One More Turn action; historical UI use is not typed-tool support |
| WMD actions | No writer/consequence model; stockpile reads do not authorize or simulate launch |
| Unattended progression | Not established; investigate the recorded 60→62 anomaly and exercise normal single-turn/blocker recovery separately |

## Remaining positive-live and normal-use cases

| Area | Needed evidence (existing fixture support is not sufficient) |
| --- | --- |
| Peace/alliance/hostile diplomacy | Eligible no-cooldown negotiation, INSPECT/search/restoration, final transfers/responses; actual formation/cancellation, unlocked projects and revealed incoming sanctions |
| First meet / Call to Arms | Fresh fully GameStarted unfriendly reply; pre-existing relationship/history branch; actual paid-neutrality execution |
| Combat/logistics | Positive native Overrun, eligible fortified naval target, plunder, observed empty-centre capture; normal reinforcement arrival/healing/recharge and multi-turn travel |
| Construction/resources | Exact damaged repair purchase/queued repair, eligible atomic swap pair, normally completed factory/production; native expansion construction branch |
| Choices/civilian | Eligible pantheon/belief/founding/custom-name/spread, adjacent founding, paid/trial story, Syncretism, bonus picker and befriending support; treat-sick native permission shape and effect |
| Attribute repeats | Positive one-repeat depth increment with normally available funding |
| Save/load/ordinary Begin | Reusable typed write round-trip, serializer completion/menu guards and exact requested save identity; readiness-only reads do not fill this gap |
| Transition variants | Placement effects, unused-point acknowledgement, other Age/campaign paths; clean Prussia replay is recorded separately |
| Later movement/trade fixes | Normal fog/queued/zero-movement/river branches, Scout future-turn automation and Send Merchant dispatch; narrower historical moves/routes are not branch coverage |
| Natural-use evidence | Separate normal earning/readiness/production from debug-created prerequisite cases; preserve the original unknown results |

## Unsupported in the inspected build/API

- **Great Work concessions:** native offers lacked safe per-work identity; no
  array-order/opaque-object guess is acceptable.
- **Force March:** no installed command/ability definition was found.
- **Legacy `UNITOPERATION_PILLAGE_ROUTE`:** absent despite permissive permission
  replies; the registered legacy wrapper rejects. Installed
  `PLUNDER_TRADE_ROUTE` has a separate guarded handler.
- **Full hidden/global combat effects and general numerical what-if simulators:**
  outside the promised bounded visible/native evidence, not missing estimates to
  fabricate from descriptions.

## Integration and documentation follow-up

- [Real Linux ChatGPT tunnel integration](todo.md) remains unverified.
- `scripts/check-live-mcp.py` needs exact x/y selection for the ASCII/SVG tools.
  It currently sends empty arguments to them, so it cannot complete today's
  full 31-reader pass. Local schema validation reproduced the missing selectors
  without contacting the game; historical all-tool passes predate these tools.
- Package metadata still permits Python 3.10, but `asyncio.timeout` requires 3.11+;
  source-checkout setup now states that requirement. Packaging also depends on
  checkout-relative assets and external protocol helpers; a standalone install
  is not documented as working. Fixing metadata/distribution is separate code work.
- Add dated native evidence when a deferred case is actually exercised. Keep
  registration counts in the catalog/overview, not every tool's historical log.
