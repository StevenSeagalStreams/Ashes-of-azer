## Built-in status effects, keyed by id.
##
## Abilities reference effects by id only, so a designer can retune Chill in
## one place and every source of it changes. Additional effects can be
## registered at runtime by other modules with [method register].
class_name StatusEffectLibrary
extends RefCounted

const CHILL: StringName = &"chill"
const FREEZE: StringName = &"freeze"
const BURN: StringName = &"burn"
const BLEED: StringName = &"bleed"
const POISON: StringName = &"poison"
const SUNDER: StringName = &"sunder"
const HASTE: StringName = &"haste"
const FORTIFY: StringName = &"fortify"

static var _registry: Dictionary = {}


## Look up an effect definition. Returns null when the id is unknown.
static func get_effect(id: StringName) -> StatusEffectData:
	_ensure_built()
	return _registry.get(id, null) as StatusEffectData


## True when [param id] resolves to a definition.
static func has_effect(id: StringName) -> bool:
	_ensure_built()
	return _registry.has(id)


## Add or replace a definition, e.g. an affix that introduces a new debuff.
static func register(effect: StatusEffectData) -> void:
	_ensure_built()
	if effect == null or effect.id == &"":
		push_warning("StatusEffectLibrary.register: effect needs a non-empty id")
		return
	_registry[effect.id] = effect


## Every registered id, sorted, for debug overlays.
static func get_ids() -> Array:
	_ensure_built()
	var ids := _registry.keys()
	ids.sort()
	return ids


static func _ensure_built() -> void:
	if not _registry.is_empty():
		return
	_add(StatusEffectData.create(
		CHILL, "Chilled", 3.0,
		{GameEnums.Stat.MOVE_SPEED: -0.35, GameEnums.Stat.ATTACK_SPEED: -0.2},
		0.0, GameEnums.DamageType.FROST, 1
	))
	var freeze := StatusEffectData.create(
		FREEZE, "Frozen", 1.5,
		{GameEnums.Stat.MOVE_SPEED: -1.0}, 0.0, GameEnums.DamageType.FROST, 1
	)
	freeze.is_incapacitating = true
	freeze.tint = Color(0.55, 0.8, 1.0)
	_add(freeze)
	_add(StatusEffectData.create(
		BURN, "Burning", 4.0, {}, 6.0, GameEnums.DamageType.FIRE, 5
	))
	_add(StatusEffectData.create(
		BLEED, "Bleeding", 5.0, {}, 4.0, GameEnums.DamageType.PHYSICAL, 5
	))
	_add(StatusEffectData.create(
		POISON, "Poisoned", 6.0,
		{GameEnums.Stat.DAMAGE_MULT: -0.1}, 3.0, GameEnums.DamageType.NATURE, 3
	))
	_add(StatusEffectData.create(
		SUNDER, "Sundered", 6.0,
		{GameEnums.Stat.ARMOR: -0.25}, 0.0, GameEnums.DamageType.PHYSICAL, 3
	))
	var haste := StatusEffectData.create(
		HASTE, "Hastened", 5.0,
		{GameEnums.Stat.MOVE_SPEED: 0.25, GameEnums.Stat.ATTACK_SPEED: 0.2}
	)
	haste.is_debuff = false
	_add(haste)
	var fortify := StatusEffectData.create(
		FORTIFY, "Fortified", 6.0, {GameEnums.Stat.ARMOR: 0.5}
	)
	fortify.is_debuff = false
	_add(fortify)


static func _add(effect: StatusEffectData) -> void:
	_registry[effect.id] = effect
