## Owns an entity's ability slots, their cooldowns and the cast timeline.
##
## Nothing here knows what an ability *does* — it validates the cast, spends
## the resource, runs wind-up → effect → recovery and reports the phases by
## signal. The player's attack state and enemy AI both drive it the same way.
class_name AbilityComponent
extends Node

## Canonical slot keys. Module B's talent trees add more at runtime.
const SLOT_PRIMARY: StringName = &"primary"
const SLOT_SECONDARY: StringName = &"secondary"
const SLOT_SPECIAL: StringName = &"special"

## A cast passed validation and its wind-up began.
signal cast_started(slot: StringName, ability: AbilityData, duration: float)
## The wind-up ended and the ability's effect fired.
signal effect_fired(slot: StringName, ability: AbilityData)
## The recovery ended and the caster is free again.
signal cast_finished(slot: StringName)
## A cast was cancelled before its effect fired (death, stagger, interrupt).
signal cast_cancelled(slot: StringName)
## A slot entered cooldown.
signal cooldown_started(slot: StringName, duration: float)
## A slot left cooldown.
signal cooldown_finished(slot: StringName)
## A cast was refused. [param reason] is [code]&"empty"[/code],
## [code]&"cooldown"[/code], [code]&"resource"[/code], [code]&"busy"[/code]
## or [code]&"incapacitated"[/code].
signal cast_failed(slot: StringName, reason: StringName)

## Stat sheet used for damage, cooldown reduction and resource spending.
@export var stats: StatsComponent
## Status effects consulted for incapacitation (frozen casters cannot act).
@export var status: StatusEffectComponent
## Side this caster fights for.
@export var faction: GameEnums.Faction = GameEnums.Faction.PLAYER
## Seconds a queued input stays valid, so a slightly early click still fires.
@export var input_buffer_time: float = 0.25

var caster: Node3D = null

var _slots: Dictionary = {}          ## StringName -> AbilityData
var _cooldowns: Dictionary = {}      ## StringName -> seconds remaining
var _cooldown_totals: Dictionary = {}## StringName -> full duration

var _casting_slot: StringName = &""
var _cast_ability: AbilityData = null
var _cast_context: AbilityContext = null
var _windup_left: float = 0.0
var _cast_left: float = 0.0
var _effect_fired: bool = false

var _buffered_slot: StringName = &""
var _buffered_aim: Vector3 = Vector3.ZERO
var _buffer_left: float = 0.0


func _ready() -> void:
	if caster == null:
		caster = get_parent() as Node3D


func _process(delta: float) -> void:
	_tick_cooldowns(delta)
	_tick_cast(delta)
	_tick_buffer(delta)


## Bind the component to the entity that casts. Call before the first cast.
func setup(p_caster: Node3D) -> void:
	caster = p_caster


# --- Slot management --------------------------------------------------------

## Assign an ability to a slot. Passing null clears the slot.
func set_ability(slot: StringName, ability: AbilityData) -> void:
	if ability == null:
		_slots.erase(slot)
		_cooldowns.erase(slot)
		_cooldown_totals.erase(slot)
		return
	_slots[slot] = ability


## Ability in a slot, or null.
func get_ability(slot: StringName) -> AbilityData:
	return _slots.get(slot, null) as AbilityData


## Every populated slot key.
func get_slots() -> Array[StringName]:
	var out: Array[StringName] = []
	for key: Variant in _slots.keys():
		out.append(key)
	return out


## Load a whole kit at once, e.g. from [PlayerClassData].
func set_kit(primary: AbilityData, secondary: AbilityData, special: AbilityData) -> void:
	set_ability(SLOT_PRIMARY, primary)
	set_ability(SLOT_SECONDARY, secondary)
	set_ability(SLOT_SPECIAL, special)


# --- Casting ----------------------------------------------------------------

## Attempt to cast [param slot] aimed at [param aim_point].
##
## Returns true when the cast began. When [param allow_buffer] is set and the
## caster is mid-cast, the input is remembered for [member input_buffer_time]
## seconds and fired as soon as the current cast ends.
func try_cast(slot: StringName, aim_point: Vector3, allow_buffer: bool = true) -> bool:
	var ability := get_ability(slot)
	if ability == null:
		cast_failed.emit(slot, &"empty")
		EventBus.ability_failed.emit(slot, &"empty")
		return false
	if status != null and status.is_incapacitated():
		cast_failed.emit(slot, &"incapacitated")
		EventBus.ability_failed.emit(slot, &"incapacitated")
		return false
	if is_casting():
		if allow_buffer:
			_buffered_slot = slot
			_buffered_aim = aim_point
			_buffer_left = input_buffer_time
		cast_failed.emit(slot, &"busy")
		return false
	if is_on_cooldown(slot):
		cast_failed.emit(slot, &"cooldown")
		EventBus.ability_failed.emit(slot, &"cooldown")
		return false
	if stats != null and ability.resource_cost > 0.0 and not stats.can_spend(ability.resource_cost):
		cast_failed.emit(slot, &"resource")
		EventBus.ability_failed.emit(slot, &"resource")
		EventBus.toast_requested.emit(
			"Not enough %s" % GameEnums.resource_display_name(stats.resource_kind)
		)
		return false

	var ctx := AbilityContext.create(caster, stats, faction, aim_point)
	ctx.slot = slot
	ctx.ability = ability

	if stats != null:
		if ability.resource_cost > 0.0 and not stats.spend_resource(ability.resource_cost):
			cast_failed.emit(slot, &"resource")
			return false
		if ability.resource_gain > 0.0:
			stats.gain_resource(ability.resource_gain)

	_casting_slot = slot
	_cast_ability = ability
	_cast_context = ctx
	_effect_fired = false
	_windup_left = ability.compute_windup(ctx)
	_cast_left = ability.compute_cast_duration(ctx)

	_start_cooldown(slot, ability.compute_cooldown(ctx))
	cast_started.emit(slot, ability, _cast_left)

	# Zero wind-up abilities must connect on the same frame they are pressed.
	if _windup_left <= 0.0:
		_fire_effect()
	return true


## True while a cast is in wind-up, effect or recovery.
func is_casting() -> bool:
	return _casting_slot != &""


## Slot currently casting, empty when idle.
func get_casting_slot() -> StringName:
	return _casting_slot


## The ability currently casting, or null.
func get_casting_ability() -> AbilityData:
	return _cast_ability


## Movement multiplier the caster should currently use.
func get_cast_move_multiplier() -> float:
	if _cast_ability == null:
		return 1.0
	return _cast_ability.move_speed_while_casting


## True when the current cast still allows the caster to turn.
func can_turn_while_casting() -> bool:
	if _cast_ability == null:
		return true
	return _cast_ability.can_turn_while_casting


## Abort the current cast. The cooldown and spent resource are *not* refunded
## when the effect already fired; interrupting a wind-up refunds the cost.
func cancel_cast(refund: bool = true) -> void:
	if not is_casting():
		return
	var slot := _casting_slot
	if refund and not _effect_fired and stats != null and _cast_ability != null:
		stats.gain_resource(_cast_ability.resource_cost)
	var was_pre_effect := not _effect_fired
	_clear_cast()
	if was_pre_effect:
		cast_cancelled.emit(slot)
	else:
		cast_finished.emit(slot)


# --- Cooldowns --------------------------------------------------------------

## True when [param slot] is still cooling down.
func is_on_cooldown(slot: StringName) -> bool:
	return float(_cooldowns.get(slot, 0.0)) > 0.0


## Seconds left on a slot's cooldown.
func get_cooldown_remaining(slot: StringName) -> float:
	return maxf(0.0, float(_cooldowns.get(slot, 0.0)))


## 0..1 sweep for the action bar, where 1 means "fully cooled down".
func get_cooldown_ratio(slot: StringName) -> float:
	var total := float(_cooldown_totals.get(slot, 0.0))
	if total <= 0.0:
		return 1.0
	return clampf(1.0 - get_cooldown_remaining(slot) / total, 0.0, 1.0)


## Clear every cooldown, e.g. when a run ends or the Healer is used.
func reset_cooldowns() -> void:
	for key: Variant in _cooldowns.keys():
		if not _cooldowns.has(key):
			continue
		_cooldowns[key] = 0.0
		cooldown_finished.emit(key)
		EventBus.ability_cooldown_finished.emit(key)


## Reduce every active cooldown by [param seconds] (cooldown-reset talents).
func reduce_cooldowns(seconds: float) -> void:
	for key: Variant in _cooldowns.keys():
		if not _cooldowns.has(key):
			continue
		if float(_cooldowns[key]) <= 0.0:
			continue
		_cooldowns[key] = maxf(0.0, float(_cooldowns[key]) - seconds)
		if float(_cooldowns[key]) <= 0.0:
			cooldown_finished.emit(key)
			EventBus.ability_cooldown_finished.emit(key)


func _start_cooldown(slot: StringName, duration: float) -> void:
	if duration <= 0.0:
		return
	_cooldowns[slot] = duration
	_cooldown_totals[slot] = duration
	cooldown_started.emit(slot, duration)
	if faction == GameEnums.Faction.PLAYER:
		EventBus.ability_cooldown_started.emit(slot, duration)


func _tick_cooldowns(delta: float) -> void:
	for key: Variant in _cooldowns.keys():
		# cooldown_finished listeners may clear a slot, which erases keys from
		# the snapshot this loop is walking.
		if not _cooldowns.has(key):
			continue
		var remaining := float(_cooldowns[key])
		if remaining <= 0.0:
			continue
		remaining = maxf(0.0, remaining - delta)
		_cooldowns[key] = remaining
		if remaining <= 0.0:
			cooldown_finished.emit(key)
			if faction == GameEnums.Faction.PLAYER:
				EventBus.ability_cooldown_finished.emit(key)


func _tick_cast(delta: float) -> void:
	if not is_casting():
		return
	if status != null and status.is_incapacitated():
		cancel_cast(true)
		return
	if not _effect_fired:
		_windup_left -= delta
		if _windup_left <= 0.0:
			_fire_effect()
	_cast_left -= delta
	if _cast_left <= 0.0:
		var slot := _casting_slot
		if not _effect_fired:
			_fire_effect()
		_clear_cast()
		cast_finished.emit(slot)


func _fire_effect() -> void:
	if _effect_fired or _cast_ability == null or _cast_context == null:
		return
	_effect_fired = true
	# Re-read the caster's facing so the shot follows the cursor through the
	# wind-up when the ability allows turning.
	if _cast_ability.can_turn_while_casting and is_instance_valid(caster):
		var delta := _cast_context.aim_point - caster.global_position
		delta.y = 0.0
		if delta.length_squared() > 0.0001:
			_cast_context.aim_direction = delta.normalized()
	_cast_ability.execute(_cast_context)
	effect_fired.emit(_casting_slot, _cast_ability)


func _clear_cast() -> void:
	_casting_slot = &""
	_cast_ability = null
	_cast_context = null
	_windup_left = 0.0
	_cast_left = 0.0
	_effect_fired = false


func _tick_buffer(delta: float) -> void:
	if _buffered_slot == &"":
		return
	_buffer_left -= delta
	if _buffer_left <= 0.0:
		_buffered_slot = &""
		return
	if is_casting():
		return
	var slot := _buffered_slot
	var aim := _buffered_aim
	_buffered_slot = &""
	try_cast(slot, aim, false)


## Update the aim point of a buffered input so a held button tracks the cursor.
func update_buffered_aim(aim_point: Vector3) -> void:
	if _buffered_slot != &"":
		_buffered_aim = aim_point
