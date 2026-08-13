## A single packet of damage travelling from a hitbox to a hurtbox.
##
## Damage is passed as an object rather than a float so that every consumer
## (armour mitigation, floating numbers, life steal, on-hit talents, death
## attribution) reads the same authoritative record of what happened.
class_name DamageInfo
extends RefCounted

## Raw damage before mitigation.
var amount: float = 0.0
## School of damage; drives resistances and number colour.
var damage_type: GameEnums.DamageType = GameEnums.DamageType.PHYSICAL
## Faction of whoever dealt the damage.
var faction: GameEnums.Faction = GameEnums.Faction.NEUTRAL
## Whether the roll critically struck.
var is_critical: bool = false
## The entity that caused the damage (usually the Player or an Enemy node).
var source: Node = null
## The ability id responsible, for on-hit talent hooks. Empty for basic contact.
var ability_id: StringName = &""
## World position the blow came from; used for knockback and hit sparks.
var origin: Vector3 = Vector3.ZERO
## Impulse in metres/second applied away from [member origin].
var knockback: float = 0.0
## Seconds of stagger (hit reaction) inflicted, if the target allows it.
var stagger: float = 0.0
## Fraction of dealt damage returned to the attacker as health, 0..1.
var life_steal: float = 0.0
## Status effects to apply on hit, as ids understood by [StatusEffectComponent].
var status_effects: Array[StringName] = []
## Damage actually applied after mitigation. Filled in by [HealthComponent].
var applied_amount: float = 0.0
## True once a [HealthComponent] has consumed this packet.
var was_absorbed: bool = false


func _init(
	p_amount: float = 0.0,
	p_type: GameEnums.DamageType = GameEnums.DamageType.PHYSICAL,
	p_faction: GameEnums.Faction = GameEnums.Faction.NEUTRAL,
	p_source: Node = null
) -> void:
	amount = p_amount
	damage_type = p_type
	faction = p_faction
	source = p_source
	if p_source is Node3D:
		origin = (p_source as Node3D).global_position


## Deep copy, so one hitbox can hand independent packets to several targets.
func copy() -> DamageInfo:
	var clone := DamageInfo.new(amount, damage_type, faction, source)
	clone.is_critical = is_critical
	clone.ability_id = ability_id
	clone.origin = origin
	clone.knockback = knockback
	clone.stagger = stagger
	clone.life_steal = life_steal
	clone.status_effects = status_effects.duplicate()
	return clone


## Direction the blow pushes [param target_position], normalised on the XZ plane.
func get_knockback_direction(target_position: Vector3) -> Vector3:
	var delta := target_position - origin
	delta.y = 0.0
	if delta.length_squared() < 0.0001:
		return Vector3.ZERO
	return delta.normalized()


## True when this packet is allowed to damage something of [param target_faction].
func can_affect(target_faction: GameEnums.Faction) -> bool:
	if target_faction == GameEnums.Faction.NEUTRAL:
		return false
	return target_faction != faction
