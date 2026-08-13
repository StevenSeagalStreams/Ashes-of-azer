## A swing that sweeps a cone in front of the caster.
##
## Used for the Warrior's Cleave and Shield Bash, and for melee enemy attacks.
## The cone is a cylinder plus an angular filter, so a wide swing and a narrow
## thrust differ only by [member arc_degrees].
class_name MeleeArcAbility
extends AbilityData

## Reach of the swing in metres.
@export var radius: float = 2.6
## Width of the cone in degrees, measured across the facing direction.
@export_range(10.0, 360.0, 5.0) var arc_degrees: float = 110.0
## How far in front of the caster the cone is centred.
@export var forward_offset: float = 0.7
## Metres the caster lunges forward as the swing fires. 0 disables the step.
@export var lunge_distance: float = 0.0
## Seconds the lunge takes.
@export var lunge_time: float = 0.12


func execute(ctx: AbilityContext) -> void:
	if ctx.caster == null:
		return
	var origin := ctx.caster.global_position + ctx.aim_direction * forward_offset
	var area := spawn_area_hitbox(ctx, origin, radius, arc_degrees)
	if area == null:
		return
	# The volume sits ahead of the caster, but the swing fans out from the
	# caster. Without this the first forward_offset metres are a dead zone.
	area.hitbox.arc_origin_node = ctx.caster
	area.hitbox.activate(maxf(0.05, active_time))
	_apply_lunge(ctx)


func _apply_lunge(ctx: AbilityContext) -> void:
	if lunge_distance <= 0.0 or ctx.caster == null:
		return
	if not ctx.caster.has_method(&"apply_impulse_motion"):
		return
	ctx.caster.call(
		&"apply_impulse_motion", ctx.aim_direction * (lunge_distance / maxf(0.01, lunge_time)),
		lunge_time
	)
