# Sidkick documentation

The root [README](../README.md) is the project introduction. This directory keeps
current instructions separate from detailed reference, campaign lessons and history.

## Set up and use

| Guide | Contents |
| --- | --- |
| [Setup](setup.md) | Dependencies, FireTuner, OpenCode stdio, standalone HTTP, troubleshooting |
| [ChatGPT bridge](chatgpt.md) | Private tunnel architecture, Linux/Windows setup and lifecycle limits |
| [Snapshots and exports](snapshots.md) | Consistency status, JSON export, safe publication and legacy filenames |
| [Maps](maps.md) | ASCII/SVG views, fixed preview URL, loopback viewer and SSH forwarding |
| [Actions](actions.md) | Opt-in safety contract, common workflows, movement and verification outcomes |
| [Peace negotiation](peace-negotiation.md) | Working drafts, exact terms, native INSPECT, bounded search and recovery |
| [Saves and Age transitions](transitions.md) | Separate ordinary-load and transition workflows; Dedications and capital |

## Reference and project status

- [Read-tool reference](reference/read-tools.md): all default tools and interpretation limits.
- [Action-tool catalog](reference/action-tools.md): all opt-in actions, grouped by purpose.
- [Coverage overview](civ7-coverage-audit.md): implemented capabilities versus verification and API gaps.
- [Action backlog](civ7-action-backlog.md): outstanding implementation and positive-live cases.
- [Tunnel TODO](todo.md): deferred real Linux tunnel integration checks.
- [Development](development.md): code layout, offline checks and optional live smoke testing.

## Campaign knowledge and history

- [Civ VII coaching KB](civ7-kb/README.md): evidence-led strategy, turn flow and the
  Russia/Prussia Game 01 case study. Refresh the loaded save before applying advice.
- [Historical records](history/README.md): dated development results and superseded audits.
- [Original write-capability investigation](civ7-write-capability-report.md):
  2026-11-05 source evidence, not today's capability list.

## Keeping this organized

Keep setup commands in the setup guides, tool semantics in reference/workflow
pages, and dated test narratives in history. Do not append release-by-release logs
to the root README. Changes to a tool should update its relevant guide and coverage
limits; use current registered schemas for exact arguments and defaults.

The software docs were reconciled against source and local tool registration on
**2026-11-17**. Campaign observations retain their own dates and evidence labels.
An implemented or fixture-tested handler is not automatically live-certified.
