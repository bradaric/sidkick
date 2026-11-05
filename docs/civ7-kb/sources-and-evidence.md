# Sources and evidence

Compiled 2026-11-05. These notes describe **Test of Time**, not launch-era Legacy Path victory conditions. Test of Time is an official update; the campaign's separate full mod list is unknown. Do not call every ToT rule a mod rule.

## Source hierarchy

For the loaded campaign, prefer:

1. Current native victory target/countdown and the user's exact action/placement preview.
2. Read-only engine output, with turn/Age/player consistency and coverage checked.
3. Applicable installed rule definitions and their activation requirements.
4. Official patch notes and guides for the relevant version.
5. Current community tests/discussions with disclosed settings.
6. Earlier chat assertions and generic guides: leads to verify, not authority.

This is not permission to dismiss contradictory evidence. Explain what differs: definition versus runtime quote, local versus empire-wide yield, current versus queued construction, historical versus current save, or unavailable versus zero.

## External sources

| ID | Source | What it supports | Retrieval status on 2026-11-05 |
|---|---|---|---|
| S1 | [Official Test of Time victory developer diary](https://civilization.2k.com/civ-vii/game-guide/gameplay/victories/) | Dominance model; declining ratios; countdown resumes after interruption; fixed science finish line | Successfully fetched |
| S2 | [Official May 19, 2026 patch notes](https://support.civilization.com/hc/en-us/articles/51685242291219-Civilization-VII-Patch-Notes-May-19-2026) | Exact default multi-Age ratio bands; Tourism sources; captured Wonders worth less; specialist/warehouse changes; UI and compatibility caveats | Successfully fetched |
| S3 | [Official June 23, 2026 update notes](https://civilization.2k.com/civ-vii/game-update-notes/2026-jun-23-patch-1-4-1/) | A later patch to check against older advice | Referenced in campaign; not freshly audited for this KB |
| S4 | [Civilization Wiki: Suzerain](https://civilization.fandom.com/wiki/Suzerain_(Civ7)) | Secondary account of chosen city-state bonus persistence | Search excerpt consulted earlier; direct fetch now returns HTTP 403; do not elevate to verified local behavior |
| S5 | [CivFanatics: Tips for ToT difficulty](https://forums.civfanatics.com/threads/tips-for-tot-difficulty.703403/) | Strategy discussion, not a definitive rules reference | Search excerpt available earlier; direct fetch now returns a browser verification page, not the article |
| S6 | [Complete Guide to Civ 7: Test of Time](https://www.youtube.com/watch?v=QGTE6ULcJ6Y) | A version-aware video starting point | Search/transcript material consulted earlier; not comprehensively reviewed |

Do not treat a successful HTTP response containing a browser challenge as a successful article review. Do not silently repeat a search snippet as if the entire source was inspected. Check publication **and** update dates. Pre-May-19-2026 guides can explain obsolete victory rules, but later publication alone does not guarantee correctness for this save.

## Repository evidence

These files were read while compiling the KB; links refer to the repository, not bundled copies:

- [README](../../README.md): data contract, focused tools and coverage limits.
- [Coverage audit](../civ7-coverage-audit.md): what is source/fixture/live verified, and historical gaps.
- [Victory query](../../civ7/victory.js): native targets, campaign-matched schedules, current/next tier, alert semantics, public scoring definitions and Modern project requirements.
- [Victory planning fixtures](../../tests/test_victory_planning.cjs): multiplier conversion, missing values, alerts and native-target preservation.
- [Empire query](../../civ7/empire.js) and [identity fixtures](../../tests/test_identity.cjs): exact current identity/persona, Age-filtered public definitions, modifier conditions and separate previous civilization.
- [Great Works query](../../civ7/great_works.js) and [fixtures](../../tests/test_great_works.cjs): owned displayed/archive instance indices, current building yield/capacity evidence and selected-work relocation checks without marginal yields or move requests.
- [Religion query](../../civ7/religion.js) and [fixtures](../../tests/test_religion.cjs): owned spread-unit current non-target readiness and charge quotes, not arbitrary-target/conversion previews.

Repository contracts and synthetic tests describe tool behavior; they are not live observations or proof that every mechanic applies to the loaded game. Refresh the relevant read-only evidence before advising.

**REPO:** a definition value `DominationPercent = 300` becomes `(300 + 100) / 100 = 4x`. A value of `100` means 2x, not 1x. The query matches `StartingAge` and `PreviousAgeCount`; unrelated rows are not defaults. Fixtures intentionally use synthetic rules and are not an exported copy of this campaign's database.

## Conversation evidence

The postmortem and domain pages manually summarize the user's reports, screenshots and Sidkick responses in this conversation. Raw JSON/transcript/save files are **not** bundled. Some earlier turns come from the conversation checkpoint rather than fresh reads. Records are non-atomic and may reflect multiple within-turn decisions.

Turn labels are Modern-local unless explicitly stated. A timestamp here is provenance, not a freshness guarantee. The final observed state was T56 with a rival countdown; the user chose to concede. No final defeat screen, replayed outcome or controlled alternative strategy was observed.

For a new factual entry, record:

```text
Claim:
Evidence label: OFFICIAL / OBSERVED / REPO / INFERRED / UNVERIFIED
Source/tool and exact relevant fields:
Campaign/rules/version and turn/Age:
Observed result (not merely a recommendation):
Activation requirements, exceptions and uncertainty:
What would falsify or supersede this entry:
```
