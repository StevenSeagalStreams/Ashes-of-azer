## An instant ring of damage centred on the caster.
##
## Frost Nova and enemy slam attacks. Unlike [SpinAbility] it fires once and is
## gone, so it reads as a single decisive beat rather than a channel.
class_name NovaAbility
extends AbilityData

## Radius of the ring in metres, before the AREA_SIZE stat.
@export var radius: float = 5.0
## Metres above the ground the volume is centred, so it catches airborne foes.
@export var height_offset: float = 0.6
## Metres the caster is pushed back by the discharge, opposite to their aim.
@export var self_knockback: float = 0.0


func execute(ctx: AbilityContext) -> void:
	if ctx.caster == null:
		return
	var origin := ctx.caster.global_position + Vector3(0.0, height_offset, 0.0)
	var area := spawn_area_hitbox(ctx, origin, radius)
	if area == null:
		return
	area.hitbox.activate(maxf(0.05, active_time))
	EventBus.combat_impact.emit(origin, impact_weight, false)
	_apply_self_knockback(ctx)


func _apply_self_knockback(ctx: AbilityContext) -> void:
	if self_knockback <= 0.0 or ctx.caster == null:
		return
	if not ctx.caster.has_method(&"apply_knockback"):
		return
	ctx.caster.call(&"apply_knockback", -ctx.aim_direction * self_knockback)
