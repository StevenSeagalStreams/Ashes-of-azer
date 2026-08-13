## Global, strongly typed signal hub.
##
## Systems that must not know about each other (HUD, camera, audio, run
## manager) meet here. Gameplay code emits; presentation code listens. Nothing
## in this file holds state — that belongs in [GameState] or [RunManager].
extends Node

# --- Combat -----------------------------------------------------------------

## Any entity took damage. [param target] is the damaged node.
signal damage_dealt(target: Node, info: DamageInfo)
## An entity died. [param victim] is already flagged dead but still in the tree.
signal entity_died(victim: Node, info: DamageInfo)
## A blow landed; presentation layers use this for hit-stop and screen shake.
signal combat_impact(world_position: Vector3, weight: float, is_critical: bool)
## Request a floating combat number at a world position.
signal damage_number_requested(world_position: Vector3, info: DamageInfo)

# --- Player -----------------------------------------------------------------

## The player node finished entering the tree and is ready to be tracked.
signal player_spawned(player: Node3D)
## The player died. The respawn flow listens for this.
signal player_died()
## Player health changed, for the HUD orb.
signal player_health_changed(current: float, maximum: float)
## Player class resource changed, for the HUD orb.
signal player_resource_changed(current: float, maximum: float, kind: GameEnums.ResourceKind)
## An ability slot began its cooldown.
signal ability_cooldown_started(slot: StringName, duration: float)
## An ability slot came off cooldown.
signal ability_cooldown_finished(slot: StringName)
## An ability could not be used. [param reason] is one of
## [code]&"cooldown"[/code], [code]&"resource"[/code], [code]&"busy"[/code],
## [code]&"empty"[/code].
signal ability_failed(slot: StringName, reason: StringName)
## The player consumed a health potion.
signal potion_used(charges_remaining: int)

# --- Progression (Module B) -------------------------------------------------

## Experience was awarded.
signal experience_gained(amount: int, total: int)
## The player reached a new level.
signal level_changed(new_level: int, talent_points_available: int)
## Talent points were spent or refunded.
signal talents_changed()

# --- Items (Module C) -------------------------------------------------------

## Loot hit the ground at a world position.
signal loot_dropped(item: Resource, world_position: Vector3)
## An item entered the player's bags.
signal item_acquired(item: Resource)
## The inventory grid or equipped set changed and UI should refresh.
signal inventory_changed()
## An equipment slot's contents changed.
signal equipment_changed(slot: GameEnums.EquipSlot, item: Resource)
## Gold total changed.
signal gold_changed(total: int)

# --- Crystals & runs (Modules E/F) ------------------------------------------

## A crystal currency total changed.
signal crystals_changed(crystal: GameEnums.CrystalType, total: int)
## The Aether Crystal lever was pulled with a validated run configuration.
signal run_requested(config: Resource)
## A gauntlet run began.
signal run_started(config: Resource)
## A wave started spawning.
signal wave_started(wave_index: int, wave_count: int, enemies_in_wave: int)
## Every enemy of a wave died.
signal wave_cleared(wave_index: int, wave_count: int)
## The boss wave began.
signal boss_spawned(boss: Node3D)
## The run ended. [param victory] is false when the player died.
signal run_finished(victory: bool, rewards: Dictionary)
## The player walked into a portal targeting [param destination].
signal portal_entered(destination: StringName)

# --- UI ---------------------------------------------------------------------

## Ask the HUD to show a transient banner, e.g. "WAVE 3".
signal announcement_requested(text: String, seconds: float)
## Ask the HUD to show a small toast, e.g. "Not enough rage".
signal toast_requested(text: String)
