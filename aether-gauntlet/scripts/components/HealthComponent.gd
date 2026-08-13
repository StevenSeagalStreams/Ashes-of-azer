## Hit points, mitigation, invulnerability and death for any entity.
##
## The component is deliberately ignorant of *how* it was hit — a [HurtboxComponent]
## hands it a [DamageInfo] and it reports the outcome through signals. Attaching
## a [StatsComponent] makes maximum health and armour follow the stat sheet.
class_name HealthComponent
extends Node

## Current and maximum health after any change.
signal health_changed(current: float, maximum: float)
## A damage packet was applied. [param info] carries [member DamageInfo.applied_amount].
signal damaged(info: DamageInfo)
## Damage was fully ignored because of invulnerability (dodge i-frames).
signal damage_negated(info: DamageInfo)
## Healing landed. [param amount] is the health actually restored.
signal healed(amount: float)
## Health reached zero. Emitted exactly once.
signal died(info: DamageInfo)
## Invulnerability turned on or off.
signal invulnerability_changed(active: bool)

## Maximum health when no [StatsComponent] is bound.
@export var max_health: float = 100.0
## Health at spawn. Negative means "start at maximum".
@export var starting_health: float = -1.0
## Optional stat sheet. When set, MAX_HEALTH and ARMOR come from it.
@export var stats: StatsComponent
## Seconds of immunity after taking a hit. 0 disables hit invulnerability.
@export var hit_invulnerability: float = 0.0
## When true the entity cannot be reduced below 1 HP (used by tutorial dummies).
@export var immortal: bool = false

var current_health: float = 0.0
var is_dead: bool = false

## Reference counted so overlapping sources (dodge + a buff) cannot clobber
## each other by both writing a bool.
var _invulnerable_refs: int = 0
var _hit_invulnerability_left: float = 0.0
var _regen_carry: float = 0.0


func _ready() -> void:
	_bind_stats()
	var maximum := get_max_health()
	current_health = maximum if starting_health < 0.0 else minf(starting_health, maximum)
	health_changed.emit(current_health, maximum)


func _process(delta: float) -> void:
	if _hit_invulnerability_left > 0.0:
		_hit_invulnerability_left = maxf(0.0, _hit_invulnerability_left - delta)
		if _hit_invulnerability_left == 0.0 and _invulnerable_refs == 0:
			invulnerability_changed.emit(false)
	_tick_regen(delta)


## Bind a stat sheet after construction. Entities assemble their components in
## [method Node._ready], which runs *after* this component's own, so the
## inspector-assigned reference is not always the final one.
func set_stats_component(value: StatsComponent) -> void:
	if stats == value:
		return
	if stats != null and stats.stats_recalculated.is_connected(_on_stats_recalculated):
		stats.stats_recalculated.disconnect(_on_stats_recalculated)
	stats = value
	_bind_stats()


func _bind_stats() -> void:
	if stats == null:
		return
	if not stats.stats_recalculated.is_connected(_on_stats_recalculated):
		stats.stats_recalculated.connect(_on_stats_recalculated)


# --- Queries ----------------------------------------------------------------

## Maximum health, taken from the stat sheet when one is bound.
func get_max_health() -> float:
	if stats != null:
		return maxf(1.0, stats.get_stat(GameEnums.Stat.MAX_HEALTH))
	return maxf(1.0, max_health)


## 0..1 fill ratio for health bars.
func get_health_ratio() -> float:
	var maximum := get_max_health()
	if maximum <= 0.0:
		return 0.0
	return clampf(current_health / maximum, 0.0, 1.0)


## True while any invulnerability source is active.
func is_invulnerable() -> bool:
	return _invulnerable_refs > 0 or _hit_invulnerability_left > 0.0


## True when the entity can still be damaged.
func is_alive() -> bool:
	return not is_dead


# --- Invulnerability --------------------------------------------------------

## Add one invulnerability reference (dodge i-frames, a shield buff).
## Every call must be paired with [method remove_invulnerability].
func add_invulnerability() -> void:
	_invulnerable_refs += 1
	if _invulnerable_refs == 1 and _hit_invulnerability_left <= 0.0:
		invulnerability_changed.emit(true)


## Release one invulnerability reference.
func remove_invulnerability() -> void:
	_invulnerable_refs = maxi(0, _invulnerable_refs - 1)
	if _invulnerable_refs == 0 and _hit_invulnerability_left <= 0.0:
		invulnerability_changed.emit(false)


## Grant invulnerability for a fixed duration without manual pairing.
func grant_timed_invulnerability(seconds: float) -> void:
	if seconds <= 0.0:
		return
	var was_invulnerable := is_invulnerable()
	_hit_invulnerability_left = maxf(_hit_invulnerability_left, seconds)
	if not was_invulnerable:
		invulnerability_changed.emit(true)


# --- Damage and healing -----------------------------------------------------

## Apply a damage packet. Returns the health actually removed (0 when negated).
## [param info] is mutated with [member DamageInfo.applied_amount].
func apply_damage(info: DamageInfo) -> float:
	if is_dead:
		return 0.0
	if is_invulnerable():
		info.applied_amount = 0.0
		info.was_absorbed = true
		damage_negated.emit(info)
		return 0.0

	var mitigated := _mitigate(info)
	if mitigated <= 0.0:
		info.applied_amount = 0.0
		info.was_absorbed = true
		return 0.0

	if immortal:
		mitigated = minf(mitigated, maxf(0.0, current_health - 1.0))

	var maximum := get_max_health()
	current_health = clampf(current_health - mitigated, 0.0, maximum)
	info.applied_amount = mitigated
	info.was_absorbed = true

	if stats != null:
		stats.notify_combat_activity()

	damaged.emit(info)
	health_changed.emit(current_health, maximum)
	EventBus.damage_dealt.emit(get_parent(), info)

	if hit_invulnerability > 0.0:
		grant_timed_invulnerability(hit_invulnerability)

	if current_health <= 0.0:
		_die(info)
	return mitigated


## Restore health. Returns the amount actually restored.
func heal(amount: float) -> float:
	if is_dead or amount <= 0.0:
		return 0.0
	var maximum := get_max_health()
	var before := current_health
	current_health = minf(maximum, current_health + amount)
	var restored := current_health - before
	if restored > 0.0:
		healed.emit(restored)
		health_changed.emit(current_health, maximum)
	return restored


## Restore a fraction of maximum health, e.g. a potion healing 35%.
func heal_percent(fraction: float) -> float:
	return heal(get_max_health() * maxf(0.0, fraction))


## Refill to maximum and clear death state — the town Healer and respawns.
func full_restore() -> void:
	is_dead = false
	_invulnerable_refs = 0
	_hit_invulnerability_left = 0.0
	current_health = get_max_health()
	health_changed.emit(current_health, get_max_health())


## Kill outright, bypassing mitigation and invulnerability.
func kill(info: DamageInfo = null) -> void:
	if is_dead:
		return
	current_health = 0.0
	health_changed.emit(current_health, get_max_health())
	_die(info if info != null else DamageInfo.new(0.0, GameEnums.DamageType.TRUE))


func _mitigate(info: DamageInfo) -> float:
	if info.damage_type == GameEnums.DamageType.TRUE:
		return maxf(0.0, info.amount)
	var reduction := 0.0
	if stats != null:
		reduction = stats.get_damage_reduction()
	return maxf(0.0, info.amount * (1.0 - reduction))


func _die(info: DamageInfo) -> void:
	if is_dead:
		return
	is_dead = true
	died.emit(info)
	EventBus.entity_died.emit(get_parent(), info)


func _tick_regen(delta: float) -> void:
	if is_dead or stats == null:
		return
	var regen := stats.get_stat(GameEnums.Stat.HEALTH_REGEN)
	if regen <= 0.0:
		return
	var maximum := get_max_health()
	if current_health >= maximum:
		return
	_regen_carry += regen * delta
	if _regen_carry >= 0.5:
		var applied := _regen_carry
		_regen_carry = 0.0
		heal(applied)


func _on_stats_recalculated() -> void:
	# Keep the health *ratio* stable when the maximum moves (levelling, gear).
	var maximum := get_max_health()
	if current_health > maximum:
		current_health = maximum
	health_changed.emit(current_health, maximum)
