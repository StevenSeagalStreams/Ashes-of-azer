## Tracks active buffs and debuffs on an entity.
##
## Stat changes are pushed into the entity's [StatsComponent] under the source
## key [code]status:<id>[/code], so removing an effect never has to know which
## individual stats it touched. Damage-over-time ticks go through the normal
## [HealthComponent] path, meaning armour, life steal hooks and floating
## numbers all behave identically to direct hits.
class_name StatusEffectComponent
extends Node

## An effect was applied or refreshed.
signal effect_applied(id: StringName, stacks: int, duration: float)
## An effect's remaining stacks changed.
signal effect_stacks_changed(id: StringName, stacks: int)
## An effect expired or was cleansed.
signal effect_removed(id: StringName)
## The entity became (or stopped being) unable to act.
signal incapacitated_changed(active: bool)

## Stat sheet that receives modifiers.
@export var stats: StatsComponent
## Health component that receives damage-over-time ticks.
@export var health: HealthComponent
## Seconds between damage-over-time ticks.
@export var tick_period: float = 0.5

## id -> {"data": StatusEffectData, "time_left": float, "stacks": int,
##        "tick_accumulator": float, "source": Node}
var _active: Dictionary = {}
var _incapacitated: bool = false


func _process(delta: float) -> void:
	if _active.is_empty():
		return
	var expired: Array[StringName] = []
	for key: Variant in _active.keys():
		var id: StringName = key
		var entry: Dictionary = _active[id]
		entry["time_left"] = float(entry["time_left"]) - delta
		_tick_damage(id, entry, delta)
		if float(entry["time_left"]) <= 0.0:
			expired.append(id)
	for id in expired:
		remove_effect(id)
	_refresh_incapacitated()


# --- Application ------------------------------------------------------------

## Apply an effect by id. Returns false when the id is unknown.
func apply(id: StringName, source: Node = null, stacks_to_add: int = 1) -> bool:
	var data := StatusEffectLibrary.get_effect(id)
	if data == null:
		push_warning("StatusEffectComponent: unknown status effect '%s'" % id)
		return false
	return apply_data(data, source, stacks_to_add)


## Apply a definition directly, for effects created on the fly by an affix.
func apply_data(data: StatusEffectData, source: Node = null, stacks_to_add: int = 1) -> bool:
	if data == null or data.id == &"":
		return false
	if health != null and not health.is_alive():
		return false

	var stacks := maxi(1, stacks_to_add)
	if _active.has(data.id):
		var entry: Dictionary = _active[data.id]
		stacks = mini(data.max_stacks, int(entry["stacks"]) + stacks_to_add)
		entry["stacks"] = stacks
		entry["time_left"] = data.duration
		entry["source"] = source
		effect_stacks_changed.emit(data.id, stacks)
	else:
		stacks = mini(data.max_stacks, stacks)
		_active[data.id] = {
			"data": data,
			"time_left": data.duration,
			"stacks": stacks,
			"tick_accumulator": 0.0,
			"source": source,
		}
	_sync_modifiers(data, stacks)
	effect_applied.emit(data.id, stacks, data.duration)
	_refresh_incapacitated()
	return true


## Apply every id in [param ids]; used by [HitboxComponent] payloads.
func apply_many(ids: Array[StringName], source: Node = null) -> void:
	for id in ids:
		apply(id, source)


## Remove an effect and its modifiers. Returns true when it was active.
func remove_effect(id: StringName) -> bool:
	if not _active.has(id):
		return false
	_active.erase(id)
	if stats != null:
		stats.remove_modifier_source(_modifier_key(id))
	effect_removed.emit(id)
	_refresh_incapacitated()
	return true


## Remove every debuff. Helpful effects are kept.
func cleanse_debuffs() -> int:
	var removed := 0
	for key: Variant in _active.keys().duplicate():
		var entry: Dictionary = _active[key]
		var data: StatusEffectData = entry["data"]
		if data.is_debuff:
			remove_effect(key)
			removed += 1
	return removed


## Remove everything, e.g. on death or respawn.
func clear_all() -> void:
	for key: Variant in _active.keys().duplicate():
		remove_effect(key)


# --- Queries ----------------------------------------------------------------

## True when [param id] is currently active.
func has_effect(id: StringName) -> bool:
	return _active.has(id)


## Current stack count, 0 when inactive.
func get_stacks(id: StringName) -> int:
	if not _active.has(id):
		return 0
	return int((_active[id] as Dictionary)["stacks"])


## Remaining seconds, 0 when inactive.
func get_time_left(id: StringName) -> float:
	if not _active.has(id):
		return 0.0
	return maxf(0.0, float((_active[id] as Dictionary)["time_left"]))


## Every active effect id.
func get_active_ids() -> Array[StringName]:
	var out: Array[StringName] = []
	for key: Variant in _active.keys():
		out.append(key)
	return out


## True while any active effect prevents the entity from acting.
func is_incapacitated() -> bool:
	return _incapacitated


# --- Internals --------------------------------------------------------------

func _modifier_key(id: StringName) -> StringName:
	return StringName("status:%s" % id)


func _sync_modifiers(data: StatusEffectData, stacks: int) -> void:
	if stats == null:
		return
	var flat := data.get_scaled_flat(stacks)
	var percent := data.get_scaled_percent(stacks)
	if flat.is_empty() and percent.is_empty():
		return
	stats.add_modifier_source(_modifier_key(data.id), flat, percent)


func _tick_damage(id: StringName, entry: Dictionary, delta: float) -> void:
	var data: StatusEffectData = entry["data"]
	if data.damage_per_second <= 0.0 or health == null or not health.is_alive():
		return
	var accumulator := float(entry["tick_accumulator"]) + delta
	if accumulator < tick_period:
		entry["tick_accumulator"] = accumulator
		return
	entry["tick_accumulator"] = accumulator - tick_period
	var stacks := int(entry["stacks"])
	var info := DamageInfo.new(
		data.damage_per_second * stacks * tick_period,
		data.damage_type,
		GameEnums.Faction.NEUTRAL,
		entry.get("source") as Node
	)
	info.ability_id = id
	var owner_node := get_parent() as Node3D
	if owner_node != null:
		info.origin = owner_node.global_position
	# DoT bypasses faction filtering: it is already attached to this entity.
	health.apply_damage(info)
	EventBus.damage_number_requested.emit(info.origin + Vector3(0.0, 1.4, 0.0), info)


func _refresh_incapacitated() -> void:
	var incapacitated := false
	for key: Variant in _active.keys():
		var entry: Dictionary = _active[key]
		var data: StatusEffectData = entry["data"]
		if data.is_incapacitating:
			incapacitated = true
			break
	if incapacitated == _incapacitated:
		return
	_incapacitated = incapacitated
	incapacitated_changed.emit(_incapacitated)
