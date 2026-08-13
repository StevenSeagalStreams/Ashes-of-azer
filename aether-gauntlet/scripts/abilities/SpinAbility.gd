## A channelled area attack that follows the caster and ticks repeatedly.
##
## The Warrior's Whirlwind. The hitbox is parented to the caster so the volume
## travels with them, and [member AbilityData.move_speed_while_casting] decides
## how mobile the channel feels.
class_name SpinAbility
extends AbilityData

## Radius of the whirl in metres, before the AREA_SIZE stat.
@export var radius: float = 3.2
## Seconds between damage ticks on the same target.
@export var tick_interval: float = 0.35
## Extra resource drained per second for the duration of the channel.
@export var resource_per_second: float = 0.0
## Degrees per second the visual spins, purely cosmetic.
@export var visual_spin_speed: float = 720.0

## Live channels, so a second cast cannot stack two whirls on one caster.
static var _active_channels: Dictionary = {}


func execute(ctx: AbilityContext) -> void:
	if ctx.caster == null:
		return
	var caster_id := ctx.caster.get_instance_id()
	_cancel_existing(caster_id)

	var area := spawn_area_hitbox(
		ctx, ctx.caster.global_position + Vector3(0.0, 0.6, 0.0),
		radius, 360.0, true, tick_interval
	)
	if area == null:
		return

	_active_channels[caster_id] = area
	area.tree_exited.connect(_on_channel_ended.bind(caster_id))
	area.hitbox.activate(maxf(tick_interval, active_time))

	if resource_per_second > 0.0 and ctx.stats != null:
		_drain_over_time(ctx, area)
	if visual_spin_speed != 0.0:
		_spin_visual(area)


func _cancel_existing(caster_id: int) -> void:
	if not _active_channels.has(caster_id):
		return
	var previous := _active_channels[caster_id] as AbilityAreaFx
	_active_channels.erase(caster_id)
	if is_instance_valid(previous):
		previous.hitbox.deactivate()


func _on_channel_ended(caster_id: int) -> void:
	_active_channels.erase(caster_id)


func _drain_over_time(ctx: AbilityContext, area: AbilityAreaFx) -> void:
	var tween := area.create_tween()
	var steps := maxi(1, int(active_time / maxf(0.05, tick_interval)))
	var per_step := resource_per_second * (active_time / float(steps))
	for i in steps:
		tween.tween_interval(active_time / float(steps))
		tween.tween_callback(_drain_step.bind(ctx, area, per_step))


func _drain_step(ctx: AbilityContext, area: AbilityAreaFx, amount: float) -> void:
	if ctx.stats == null or not is_instance_valid(area):
		return
	if not ctx.stats.spend_resource(amount):
		# Out of resource: the channel ends early rather than free-wheeling.
		area.hitbox.deactivate()


func _spin_visual(area: AbilityAreaFx) -> void:
	if area.visual == null:
		return
	var turns := active_time * (visual_spin_speed / 360.0)
	var tween := area.create_tween()
	tween.tween_property(
		area.visual, ^"rotation:y", area.visual.rotation.y + TAU * turns, active_time
	)
