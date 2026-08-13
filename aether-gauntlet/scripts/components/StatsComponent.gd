## Authoritative stat sheet for an entity, plus its class resource pool.
##
## Stats are computed as [code](base + flat) * (1 + percent)[/code]. Modifiers
## are grouped by a source key (a talent id, an equipped item's uid, a status
## effect id) so a whole source can be removed atomically without bookkeeping
## at the call site. Results are cached and only recomputed when marked dirty.
class_name StatsComponent
extends Node

## Emitted whenever the cached stat table was rebuilt.
signal stats_recalculated()
## Emitted when the class resource pool changes.
signal resource_changed(current: float, maximum: float)
## Emitted when the pool is too low for a requested spend.
signal resource_insufficient(requested: float, available: float)

## Which pool this entity uses. Drives regeneration behaviour.
@export var resource_kind: GameEnums.ResourceKind = GameEnums.ResourceKind.MANA
## Rage decays out of combat instead of regenerating.
@export var rage_decay_per_second: float = 2.0
## Seconds without dealing or taking damage before rage begins to decay.
@export var rage_decay_delay: float = 5.0
## Start the pool full (mana/focus) or empty (rage).
@export var start_resource_full: bool = true

var _base: Dictionary = {}          ## Stat -> float
var _flat: Dictionary = {}          ## StringName -> (Stat -> float)
var _percent: Dictionary = {}       ## StringName -> (Stat -> float)
var _cache: Dictionary = {}         ## Stat -> float
var _dirty: bool = true

var current_resource: float = 0.0
var _time_since_combat: float = 0.0

## Sensible neutral values so an entity with no configuration still functions.
const DEFAULT_BASE: Dictionary = {
	GameEnums.Stat.STRENGTH: 10.0,
	GameEnums.Stat.INTELLECT: 10.0,
	GameEnums.Stat.DEXTERITY: 10.0,
	GameEnums.Stat.VITALITY: 10.0,
	GameEnums.Stat.MAX_HEALTH: 100.0,
	GameEnums.Stat.HEALTH_REGEN: 0.0,
	GameEnums.Stat.MAX_RESOURCE: 100.0,
	GameEnums.Stat.RESOURCE_REGEN: 8.0,
	GameEnums.Stat.ATTACK_POWER: 10.0,
	GameEnums.Stat.SPELL_POWER: 10.0,
	GameEnums.Stat.ATTACK_SPEED: 1.0,
	GameEnums.Stat.CRIT_CHANCE: 0.05,
	GameEnums.Stat.CRIT_DAMAGE: 1.5,
	GameEnums.Stat.DAMAGE_MULT: 1.0,
	GameEnums.Stat.AREA_SIZE: 1.0,
	GameEnums.Stat.PROJECTILE_SPEED: 1.0,
	GameEnums.Stat.LIFE_STEAL: 0.0,
	GameEnums.Stat.ARMOR: 0.0,
	GameEnums.Stat.MOVE_SPEED: 6.0,
	GameEnums.Stat.COOLDOWN_REDUCTION: 0.0,
	GameEnums.Stat.DODGE_CHARGES: 1.0,
}

## Stats that are multipliers around 1.0 rather than additive pools. Percentage
## modifiers still work on them, but their *base* must never fall to zero.
const MULTIPLIER_STATS: Array[int] = [
	GameEnums.Stat.ATTACK_SPEED,
	GameEnums.Stat.DAMAGE_MULT,
	GameEnums.Stat.AREA_SIZE,
	GameEnums.Stat.PROJECTILE_SPEED,
	GameEnums.Stat.CRIT_DAMAGE,
]


func _ready() -> void:
	if _base.is_empty():
		set_base_stats(DEFAULT_BASE)
	current_resource = get_stat(GameEnums.Stat.MAX_RESOURCE) if start_resource_full else 0.0
	resource_changed.emit(current_resource, get_stat(GameEnums.Stat.MAX_RESOURCE))


func _process(delta: float) -> void:
	_time_since_combat += delta
	_tick_resource(delta)


# --- Base values ------------------------------------------------------------

## Replace the entire base table. Missing keys fall back to [constant DEFAULT_BASE].
func set_base_stats(values: Dictionary) -> void:
	_base = DEFAULT_BASE.duplicate(true)
	for key: Variant in values.keys():
		_base[key] = float(values[key])
	_dirty = true
	_recalculate()


## Set a single base value, e.g. when levelling up.
func set_base_stat(stat: GameEnums.Stat, value: float) -> void:
	_base[stat] = value
	_dirty = true
	_recalculate()


## Read a base value without modifiers applied.
func get_base_stat(stat: GameEnums.Stat) -> float:
	return float(_base.get(stat, DEFAULT_BASE.get(stat, 0.0)))


# --- Modifiers --------------------------------------------------------------

## Register (or replace) a named bundle of modifiers.
## [param flat] and [param percent] map [enum GameEnums.Stat] to float.
func add_modifier_source(
	source: StringName, flat: Dictionary = {}, percent: Dictionary = {}
) -> void:
	if flat.is_empty():
		_flat.erase(source)
	else:
		_flat[source] = flat.duplicate()
	if percent.is_empty():
		_percent.erase(source)
	else:
		_percent[source] = percent.duplicate()
	_dirty = true
	_recalculate()


## Drop every modifier registered under [param source]. Returns true if
## anything was actually removed.
func remove_modifier_source(source: StringName) -> bool:
	var removed := _flat.erase(source)
	removed = _percent.erase(source) or removed
	if removed:
		_dirty = true
		_recalculate()
	return removed


## True when [param source] currently contributes modifiers.
func has_modifier_source(source: StringName) -> bool:
	return _flat.has(source) or _percent.has(source)


## Every registered source key, for debugging and the character sheet.
func get_modifier_sources() -> Array[StringName]:
	var out: Array[StringName] = []
	for key: Variant in _flat.keys():
		out.append(key)
	for key: Variant in _percent.keys():
		if not out.has(key):
			out.append(key)
	return out


## Remove all modifiers. Base stats are untouched.
func clear_modifiers() -> void:
	_flat.clear()
	_percent.clear()
	_dirty = true
	_recalculate()


# --- Reading ----------------------------------------------------------------

## Final value of [param stat] with all modifiers applied.
func get_stat(stat: GameEnums.Stat) -> float:
	if _dirty:
		_recalculate()
	return float(_cache.get(stat, 0.0))


## Snapshot of every final stat, for the character sheet.
func get_all_stats() -> Dictionary:
	if _dirty:
		_recalculate()
	return _cache.duplicate()


func _recalculate() -> void:
	_cache.clear()
	for key: Variant in _base.keys():
		var stat: GameEnums.Stat = key
		var flat_total: float = 0.0
		for source: Variant in _flat.keys():
			var bundle: Dictionary = _flat[source]
			flat_total += float(bundle.get(stat, 0.0))
		var percent_total: float = 0.0
		for source: Variant in _percent.keys():
			var bundle: Dictionary = _percent[source]
			percent_total += float(bundle.get(stat, 0.0))
		var value: float = (float(_base[stat]) + flat_total) * (1.0 + percent_total)
		_cache[stat] = _clamp_stat(stat, value)
	_dirty = false
	stats_recalculated.emit()


func _clamp_stat(stat: GameEnums.Stat, value: float) -> float:
	match stat:
		GameEnums.Stat.CRIT_CHANCE:
			return clampf(value, 0.0, 1.0)
		GameEnums.Stat.LIFE_STEAL:
			return clampf(value, 0.0, 1.0)
		GameEnums.Stat.COOLDOWN_REDUCTION:
			return clampf(value, 0.0, 0.75)
		GameEnums.Stat.MOVE_SPEED:
			return maxf(value, 0.0)
	if MULTIPLIER_STATS.has(stat):
		return maxf(value, 0.05)
	return maxf(value, 0.0)


# --- Resource pool ----------------------------------------------------------

## True when the pool holds at least [param cost].
func can_spend(cost: float) -> bool:
	return current_resource >= cost - 0.001


## Spend from the pool. Returns false and emits [signal resource_insufficient]
## when the pool is too low; nothing is deducted in that case.
func spend_resource(cost: float) -> bool:
	if cost <= 0.0:
		return true
	if not can_spend(cost):
		resource_insufficient.emit(cost, current_resource)
		return false
	current_resource = maxf(0.0, current_resource - cost)
	resource_changed.emit(current_resource, get_stat(GameEnums.Stat.MAX_RESOURCE))
	return true


## Add to the pool, clamped to the maximum. Returns the amount actually added.
func gain_resource(amount: float) -> float:
	if amount <= 0.0:
		return 0.0
	var maximum := get_stat(GameEnums.Stat.MAX_RESOURCE)
	var before := current_resource
	current_resource = minf(maximum, current_resource + amount)
	var gained := current_resource - before
	if gained > 0.0:
		resource_changed.emit(current_resource, maximum)
	return gained


## Fill the pool to full, e.g. on level-up or at the town Healer.
func refill_resource() -> void:
	var maximum := get_stat(GameEnums.Stat.MAX_RESOURCE)
	if is_equal_approx(current_resource, maximum):
		return
	current_resource = maximum
	resource_changed.emit(current_resource, maximum)


## 0..1 fill ratio for the HUD orb.
func get_resource_ratio() -> float:
	var maximum := get_stat(GameEnums.Stat.MAX_RESOURCE)
	if maximum <= 0.0:
		return 0.0
	return clampf(current_resource / maximum, 0.0, 1.0)


## Called by combat code so rage knows the entity is still fighting.
func notify_combat_activity() -> void:
	_time_since_combat = 0.0


func _tick_resource(delta: float) -> void:
	var maximum := get_stat(GameEnums.Stat.MAX_RESOURCE)
	if maximum <= 0.0:
		return
	if resource_kind == GameEnums.ResourceKind.RAGE:
		if _time_since_combat >= rage_decay_delay and current_resource > 0.0:
			var before := current_resource
			current_resource = maxf(0.0, current_resource - rage_decay_per_second * delta)
			if not is_equal_approx(before, current_resource):
				resource_changed.emit(current_resource, maximum)
		return
	if current_resource >= maximum:
		return
	var regen := get_stat(GameEnums.Stat.RESOURCE_REGEN)
	if regen <= 0.0:
		return
	var previous := current_resource
	current_resource = minf(maximum, current_resource + regen * delta)
	if not is_equal_approx(previous, current_resource):
		resource_changed.emit(current_resource, maximum)


# --- Derived helpers --------------------------------------------------------

## Armour mitigation as a 0..0.85 fraction. Uses the classic
## [code]armor / (armor + K)[/code] curve so armour never reaches immunity.
func get_damage_reduction() -> float:
	var armor := get_stat(GameEnums.Stat.ARMOR)
	if armor <= 0.0:
		return 0.0
	return clampf(armor / (armor + 400.0), 0.0, 0.85)


## Cooldown after cooldown reduction is applied.
func apply_cooldown_reduction(base_cooldown: float) -> float:
	return maxf(0.05, base_cooldown * (1.0 - get_stat(GameEnums.Stat.COOLDOWN_REDUCTION)))


## Roll a critical hit against [member GameEnums.Stat.CRIT_CHANCE].
func roll_critical() -> bool:
	return randf() < get_stat(GameEnums.Stat.CRIT_CHANCE)
