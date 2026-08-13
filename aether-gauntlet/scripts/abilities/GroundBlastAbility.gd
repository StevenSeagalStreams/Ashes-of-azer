## A telegraphed area strike at the aimed ground position.
##
## The Wizard's Meteor (one heavy pulse) and the Ranger's Arrow Storm (several
## light pulses) are the same ability with different pulse counts. The decal
## always appears before damage so the strike can be dodged.
class_name GroundBlastAbility
extends AbilityData

const TELEGRAPH_SCENE: PackedScene = preload("res://scenes/fx/TelegraphDecal.tscn")

## Radius of the strike in metres, before the AREA_SIZE stat.
@export var radius: float = 3.5
## Seconds the telegraph fills before the first pulse.
@export var telegraph_time: float = 0.7
## How many damage pulses land.
@export_range(1, 20, 1) var pulse_count: int = 1
## Seconds between pulses when [member pulse_count] is above 1.
@export var pulse_interval: float = 0.4
## Furthest the strike can be placed from the caster, in metres.
@export var max_cast_range: float = 14.0
## Damage of each pulse as a fraction of the ability's computed damage.
@export_range(0.05, 1.0, 0.05) var damage_per_pulse: float = 1.0
## Show the telegraph even when the caster is the player. Turning this off is
## reserved for instant utility strikes.
@export var show_telegraph: bool = true


func execute(ctx: AbilityContext) -> void:
	if ctx.caster == null or not ctx.caster.is_inside_tree():
		return
	var parent := resolve_spawn_parent(ctx)
	if parent == null:
		push_error("GroundBlastAbility '%s': no valid parent to spawn into" % id)
		return

	var target := _clamp_to_range(ctx)
	var scaled_radius := radius * compute_area_scale(ctx)

	if not show_telegraph or telegraph_time <= 0.0:
		_strike(ctx, parent, target)
		return

	var decal := TELEGRAPH_SCENE.instantiate() as TelegraphDecal
	decal.color = GameEnums.damage_type_color(damage_type)
	parent.add_child(decal)
	decal.global_position = target
	decal.completed.connect(_strike.bind(ctx, parent, target))
	decal.start(scaled_radius, telegraph_time)


func _clamp_to_range(ctx: AbilityContext) -> Vector3:
	var origin := ctx.caster.global_position
	var target := Vector3(ctx.aim_point.x, origin.y, ctx.aim_point.z)
	var offset := target - origin
	if offset.length() > max_cast_range:
		target = origin + offset.normalized() * max_cast_range
	return target


func _strike(ctx: AbilityContext, parent: Node, target: Vector3) -> void:
	if not is_instance_valid(parent) or not parent.is_inside_tree():
		return
	# The caster can die during the telegraph; the strike still lands, but the
	# context must not carry a freed node into the damage packet.
	if not is_instance_valid(ctx.caster):
		ctx.caster = null
	if not is_instance_valid(ctx.stats):
		ctx.stats = null
	var duration := maxf(active_time, pulse_interval * float(pulse_count - 1) + 0.05)
	var area := spawn_area_hitbox(
		ctx, target + Vector3(0.0, 0.6, 0.0), radius, 360.0, false,
		pulse_interval if pulse_count > 1 else 0.0
	)
	if area == null:
		return
	area.hitbox.damage *= damage_per_pulse
	area.hitbox.activate(duration)
	EventBus.combat_impact.emit(target, impact_weight, false)
