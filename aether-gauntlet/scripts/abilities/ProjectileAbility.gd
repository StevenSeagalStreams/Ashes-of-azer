## Fires one or more travelling projectiles toward the aim point.
##
## Covers the Wizard's Arcane Bolt, the Ranger's Quick Shot and Multishot, and
## ranged enemy attacks. A fan is described by [member projectile_count] and
## [member spread_degrees]; a single shot is the same code with count 1.
class_name ProjectileAbility
extends AbilityData

const PROJECTILE_SCENE: PackedScene = preload("res://scenes/world/Projectile.tscn")

## Number of projectiles per cast.
@export_range(1, 24, 1) var projectile_count: int = 1
## Total width of the fan in degrees. Ignored when the count is 1.
@export var spread_degrees: float = 0.0
## Random angular jitter in degrees applied to each projectile.
@export var accuracy_spread_degrees: float = 0.0
## Metres per second, before the PROJECTILE_SPEED stat.
@export var projectile_speed: float = 18.0
## Metres travelled before despawning.
@export var projectile_range: float = 22.0
## Collision radius of each projectile.
@export var projectile_radius: float = 0.28
## Enemies each projectile passes through before stopping.
@export_range(0, 10, 1) var pierce_count: int = 0
## Radians per second of homing correction. 0 means the shot flies straight.
@export var homing_strength: float = 0.0
## Metres in front of the caster the projectile spawns.
@export var muzzle_offset: float = 0.9
## Height above the caster's origin the projectile spawns at.
@export var muzzle_height: float = 1.0
## Damage of each projectile as a fraction of the ability's computed damage.
## A five-arrow Multishot uses a fraction below 1 so the fan is not five times
## a single shot.
@export_range(0.05, 1.0, 0.05) var damage_per_projectile: float = 1.0


func execute(ctx: AbilityContext) -> void:
	if ctx.caster == null:
		return
	var parent := resolve_spawn_parent(ctx)
	if parent == null:
		push_error("ProjectileAbility '%s': no valid parent to spawn into" % id)
		return

	var origin := ctx.get_muzzle_position(muzzle_offset, muzzle_height)
	var speed_scale := maxf(0.1, ctx.get_stat(GameEnums.Stat.PROJECTILE_SPEED, 1.0))
	var base_angle := atan2(ctx.aim_direction.x, ctx.aim_direction.z)

	for index in projectile_count:
		var angle := base_angle + _fan_offset(index) + _accuracy_offset()
		var direction := Vector3(sin(angle), 0.0, cos(angle)).normalized()
		_spawn_one(ctx, parent, origin, direction, speed_scale)


func _fan_offset(index: int) -> float:
	if projectile_count <= 1 or is_zero_approx(spread_degrees):
		return 0.0
	var step := spread_degrees / float(projectile_count - 1)
	return deg_to_rad(-spread_degrees * 0.5 + step * index)


func _accuracy_offset() -> float:
	if accuracy_spread_degrees <= 0.0:
		return 0.0
	return deg_to_rad(randf_range(-accuracy_spread_degrees, accuracy_spread_degrees) * 0.5)


func _spawn_one(
	ctx: AbilityContext, parent: Node, origin: Vector3, direction: Vector3, speed_scale: float
) -> void:
	var projectile := PROJECTILE_SCENE.instantiate() as Projectile
	projectile.speed = projectile_speed * speed_scale
	projectile.max_range = projectile_range
	projectile.pierce_count = pierce_count
	projectile.homing_strength = homing_strength
	parent.add_child(projectile)
	projectile.launch(origin, direction)

	var hitbox := projectile.hitbox
	configure_hitbox(hitbox, ctx)
	hitbox.damage *= damage_per_projectile
	hitbox.apply_area_scale(projectile_radius * compute_area_scale(ctx))
	projectile.set_tint(GameEnums.damage_type_color(damage_type))
	projectile.arm()
