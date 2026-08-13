## Everything an ability needs to know about the cast that invoked it.
##
## Passing one object instead of six parameters keeps [method AbilityData.execute]
## stable as later modules add fields (talent ranks, item skill modifiers).
class_name AbilityContext
extends RefCounted

## The entity casting. Usually the [Player] or an [Enemy].
var caster: Node3D = null
## Caster's stat sheet; drives damage, crit, area and cooldowns.
var stats: StatsComponent = null
## Caster's status effects, for abilities that consume or check debuffs.
var status: StatusEffectComponent = null
## Side the cast belongs to.
var faction: GameEnums.Faction = GameEnums.Faction.PLAYER
## Ground position the cast is aimed at.
var aim_point: Vector3 = Vector3.ZERO
## Normalised XZ direction from caster to [member aim_point].
var aim_direction: Vector3 = Vector3.FORWARD
## Node transient effects are parented to. Defaults to the caster's parent so
## spawned hitboxes are not destroyed when the caster dies mid-cast.
var spawn_parent: Node = null
## The slot the ability was cast from, e.g. [code]&"primary"[/code].
var slot: StringName = &""
## The ability being executed.
var ability: AbilityData = null
## Talent-granted rank, reserved for Module B scaling.
var rank: int = 1


static func create(
	p_caster: Node3D,
	p_stats: StatsComponent,
	p_faction: GameEnums.Faction,
	p_aim_point: Vector3
) -> AbilityContext:
	var ctx := AbilityContext.new()
	ctx.caster = p_caster
	ctx.stats = p_stats
	ctx.faction = p_faction
	ctx.aim_point = p_aim_point
	if p_caster != null:
		ctx.spawn_parent = p_caster.get_parent()
		var delta := p_aim_point - p_caster.global_position
		delta.y = 0.0
		ctx.aim_direction = (
			delta.normalized() if delta.length_squared() > 0.0001
			else -p_caster.global_transform.basis.z
		)
	return ctx


## Position at chest height in front of the caster, used as a spawn muzzle.
func get_muzzle_position(forward_offset: float = 0.9, height: float = 1.0) -> Vector3:
	if caster == null:
		return aim_point
	return caster.global_position + aim_direction * forward_offset + Vector3(0.0, height, 0.0)


## Rotation that faces [member aim_direction] on the XZ plane.
func get_aim_basis() -> Basis:
	var flat := Vector3(aim_direction.x, 0.0, aim_direction.z)
	if flat.length_squared() < 0.0001:
		return Basis.IDENTITY
	return Basis.looking_at(flat.normalized(), Vector3.UP)


## Read a stat from the caster, falling back to [param fallback] when the
## caster has no stat sheet (an enemy scripted without one, a unit test).
func get_stat(stat: GameEnums.Stat, fallback: float = 0.0) -> float:
	if stats == null:
		return fallback
	return stats.get_stat(stat)
