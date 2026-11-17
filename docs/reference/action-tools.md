# Action-tool catalog

**129 opt-in actions**, registered with `--transport stdio --enable-writes` alongside
31 readers (**160 total**), checked on 2026-11-17. This is a navigation catalog,
not a substitute for the current MCP argument schema and full tool description.
Read the [action contract](../actions.md) before use. Presence does not establish
live verification or authorization; see [coverage](../civ7-coverage-audit.md).

## Research, government and cards

| Tool | Scope |
| --- | --- |
| `select_civ7_technology` | One offered technology node |
| `select_civ7_civic` | One offered civic node |
| `set_civ7_policy_active` | One ordinary policy toggle |
| `set_civ7_culture_card` | Explicit policy/tradition/crisis group toggle |
| `review_civ7_policies` | Acknowledge card-review reminder, no card change |
| `choose_civ7_government` | Pending current-Age government choice |
| `choose_civ7_celebration` | Pending earned celebration choice |
| `buy_civ7_attribute_node` | One attribute purchase, including repeatable |
| `choose_civ7_syncretism` | One offered family/trait-hash choice; replacement acknowledgement where required |

## Settlements, construction and resources

| Tool | Scope |
| --- | --- |
| `append_civ7_city_production` | One normal queue tail; no replacement/overbuild |
| `purchase_civ7_city_item` | Capped unit/building purchase |
| `append_civ7_advanced_construction` | Token-bound Wonder/repair/overbuild/improvement queue intent |
| `purchase_civ7_repair` | Capped repair of one existing damaged completed instance |
| `edit_civ7_production_queue` | Cancel one order or swap adjacent entries |
| `set_civ7_town_focus` | Offered town focus or GROWTH |
| `acknowledge_civ7_town_focus_reminder` | Native reminder review, no focus change |
| `upgrade_civ7_town` | Capped permanent town-to-city upgrade |
| `place_civ7_population` | One ready rural growth placement |
| `assign_civ7_specialist` | One ready city population into an eligible slot |
| `assign_civ7_resource` | Exact map/off-map owned resource assignment |
| `unassign_civ7_resource` | Exact current source unassignment |
| `swap_civ7_resources` | Native atomic assigned pair swap, no sequential fallback |
| `clear_civ7_factory_resources` | Explicit token-bound factory Clear |
| `review_civ7_resources` | Acknowledge review reminder, no assignments |

## Civilian, religious and cultural actions

| Tool | Scope |
| --- | --- |
| `perform_civ7_local_civilian_action` | Fixed current-tile found/excavate/research/spread/great_person/resettle/treat_sick intents |
| `found_civ7_adjacent_settlement` | Exact native-offered adjacent founding, including eligible embarked founders |
| `resettle_civ7_migrant` | Exact native acquire-tile improvement/population path |
| `connect_civ7_merchant_road` | One native offered owned-centre connection |
| `establish_civ7_trade_route` | Direct establishment or single native Send Merchant dispatch |
| `choose_civ7_religious_action` | Pantheon, belief or religion founding; conditional custom name |
| `spread_civ7_foreign_religion` | Exact visible met foreign centre; own consumption verification only |
| `move_civ7_great_work` | One owned instance to a compatible free slot |
| `archive_civ7_great_work` | One displayed owned work to archive |
| `activate_civ7_commander_great_person` | Effect-specific Santa Anna/Morelos/Villa commander activation |

## Orders, movement and logistics

| Tool | Scope |
| --- | --- |
| `set_civ7_unit_order` | skip/sleep/wake/fortify/heal/alert/cancel; Scout-only auto_explore |
| `move_civ7_unit` | Normal native fog-capable movement and queued continuation |
| `travel_civ7_unit` | Optional strict visible/empty current-turn path, 1–8 edges |
| `advance_civ7_unit` | Adjacent empty wartime enemy field; not city entry |
| `move_civ7_commander` | Bounded current-turn commander/packed-army movement |
| `cross_civ7_commander_shore` | One exact shore/river endpoint crossing with member preservation |
| `rail_civ7_unit` | Native ordinary land-unit rail, no walking fallback |
| `rail_civ7_commander` | Native land commander/packed army rail |
| `promote_civ7_unit` | One exact earned promotion/commendation |
| `upgrade_civ7_unit` | Capped direct upgrade; exact supported English native quote |
| `upgrade_civ7_army` | Capped all-member native upgrade; reconciled individual/aggregate quotes |
| `pack_civ7_commander` | Native pack-nearby, engine selects eligible members |
| `unpack_civ7_commander` | Native full deployment, engine selects individual cells |
| `join_civ7_commander` | One exact packable land unit into an army |
| `leave_civ7_commander` | Exact land member deployment |
| `join_civ7_fleet` | One exact naval combat member |
| `leave_civ7_fleet` | Exact naval member deployment |
| `reinforce_civ7_unit` | Assignment to an exact owned commander, not arrival |
| `rebase_civ7_aircraft` | Exact owned city Aerodrome destination |
| `transfer_civ7_aircraft` | Exact offered Aerodrome/squadron/carrier stationing |
| `establish_civ7_air_base` | Exact native squadron base location |
| `join_civ7_airlift` | Eligible Infantry into promoted Airborne Forces Squadron |
| `leave_civ7_airlift` | Exact Infantry deployment |
| `airdrop_civ7_infantry` | One Infantry; preserve other captured members/aircraft |
| `airdrop_civ7_infantry_group` | Complete 2–7 Infantry payload, safe visible landing footprint |
| `grant_civ7_second_wind` | Exact native recipient; verified movement/attack increment |

## Combat and capture

| Tool | Scope |
| --- | --- |
| `attack_civ7_unit` | Individual melee/ranged visible hostile field target |
| `ranged_attack_civ7_enemy_field` | Distinct enemy-owned field ranged scope |
| `melee_attack_civ7_enemy_field` | Adjacent enemy-owned non-district field melee |
| `naval_attack_civ7_unit` | Exact naval target; guarded enemy/known third-party waters supported |
| `naval_attack_civ7_land_unit` | Native shore fire against exact land unit, no landing |
| `bombard_civ7_district` | Land ranged/siege defensible-district attack |
| `bombard_civ7_shore_district` | Native naval defensible-land-district attack |
| `attack_civ7_commander` | Native direct Heroic Assault, not packed-member attacks |
| `ranged_attack_civ7_army` | Native land Focus Fire with eligible ranged participants |
| `melee_attack_civ7_army` | Native coordinated Infantry/Cavalry melee |
| `overrun_civ7_unit` | Native-gated packed-army Overrun |
| `attack_civ7_fleet` | Native Heavy/Light focused naval commands |
| `observe_civ7_field_attack` | Guarded field attack with bounded visible/event accounting |
| `observe_civ7_army_attack` | Guarded group attack with bounded accounting |
| `air_attack_civ7_unit` | Individual aircraft from captured owned city Aerodrome |
| `air_attack_civ7_from_commander` | Individual aircraft bound to Aerodrome/squadron/carrier |
| `group_civ7_air_attack` | Native packed Ground Attack participants |
| `sweep_civ7_air_location` | Native Fighter Sweep, not a guessed enemy aircraft target |
| `bombard_civ7_air_district` | Native Carpet Bomb, exact district/constructible evidence |
| `pillage_civ7_tile` | Current-tile constructible pillage, not exact loot accounting |
| `coastal_raid_civ7_tile` | Native adjacent constructible raid, no landing |
| `plunder_civ7_trade_route` | Installed current-tile trade plunder command |
| `pillage_civ7_route` | **Legacy unsupported operation:** installed-definition guard rejects |
| `assault_civ7_city` | Adjacent melee/occupation of exact empty visible centre |
| `resolve_civ7_city_capture` | Separate pending keep/raze-start decision |

Some combat tools offer `observe_effects`; discover each schema. Bounded visible
health/native kill evidence is not a full hidden/global-effect simulation.

## Diplomacy and peace

| Tool | Scope |
| --- | --- |
| `start_civ7_diplomatic_project` | Open Borders, Research Collaboration or Cultural Exchange |
| `start_civ7_city_state_project` | Promote Growth, Bolster Military or Incorporate start |
| `befriend_civ7_independent` | Exact capped native befriending start |
| `support_civ7_befriending` | One additional own support token, not rival support |
| `choose_civ7_city_state_bonus` | Exact pending suzerain picker |
| `levy_civ7_city_state_unit` | Exact offered unit/public-type pair and capped quote |
| `respond_civ7_diplomatic_project` | Offered cooperative accept/support/reject response |
| `respond_civ7_hostile_project` | Exact revealed incoming sanction response |
| `respond_civ7_first_meet` | Notification-bound offered greeting; no permission-only shortcut |
| `pay_civ7_call_to_arms` | Offered capped paid neutrality; not join-war/alliance-breaking choice |
| `manage_civ7_alliance` | Separate native form/cancel with zero-cost/penalty guards |
| `declare_civ7_war` | Explicit native surprise/formal declaration |
| `support_civ7_own_war` | One quoted own-side war support token |
| `start_civ7_hostile_diplomatic_project` | Fixed capped no-secondary hostile/espionage projects |
| `start_civ7_targeted_diplomacy` | Fixed paired aid/city/independent-raid secondary intents |
| `withdraw_civ7_project_support` | Sole-own-support, zero-definition-penalty withdrawal |
| `withdraw_civ7_capped_project_support` | Explicit definition-penalty caps/multi-token decrement |
| `manage_civ7_white_peace_deal` | Narrow single MAKE_PEACE draft workflow |
| `manage_civ7_peace_concession` | Narrow Gold/Influence lump-term workflow |
| `manage_civ7_city_peace_deal` | Narrow one exact native OFFER city workflow |
| `manage_civ7_peace_deal` | Multi-term draft edit/inspect/propose/respond/recover |
| `search_civ7_peace_deals` | Bounded selected-term native INSPECT search, never final submission |

See [peace negotiation](../peace-negotiation.md) for tokens, caps and recovery.

## Narrative, reminders and turns

| Tool | Scope |
| --- | --- |
| `choose_civ7_narrative` | Exact pending zero-cost non-trial choice/CLOSE |
| `choose_civ7_extended_narrative` | Acknowledged trial/known runtime-quoted paid variants |
| `acknowledge_civ7_agenda` | Exact owned agenda reminder |
| `acknowledge_civ7_advisor_warning` | Native advisor operation, not generic dismissal |
| `acknowledge_civ7_espionage_report` | Open exact report, match popup, Continue once |
| `close_civ7_triumph_popup` | Exact current sole native Close; not next queued popup |
| `end_civ7_turn` | Guarded one ordinary turn; no forced blockers/Age transition |

## Saves and campaign boundaries

| Tool | Scope |
| --- | --- |
| `save_civ7_game` | New local manual save, never overwrite |
| `load_civ7_game` | Exact token-bound load; discards unsaved progress |
| `begin_civ7_loaded_game` | Exact ordinary loading-screen Begin |
| `open_civ7_transition` | Pending native civilization chooser |
| `select_civ7_transition_civilization` | Transition-only selector, not normal setup parameter |
| `select_civ7_transition_memento` | One eligible slot/item or NONE |
| `confirm_civ7_transition_choices` | Native Finished only |
| `view_civ7_transition_map` | Native View Map/chooser closure |
| `advance_civ7_age_transition` | Guarded acknowledged/nonfinal Age boundary |
| `begin_civ7_transition_age` | Separate transition loading Continue or Age-welcome Begin |
| `edit_civ7_dedication` | One current-deck add/remove |
| `apply_civ7_dedication_effect` | One non-placement effect |
| `place_civ7_dedication_effect` | One exact native-legal settlement placement effect |
| `select_civ7_transition_capital` | Exact owned candidate, no name swap |
| `complete_civ7_dedications` | Resolved deck/capital confirmation |

See [saves and transitions](../transitions.md). There is no general shell/UI
automation, arbitrary JavaScript dispatcher, WMD writer or reusable post-victory
One More Turn action in this catalog.
