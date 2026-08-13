## A travelling damage volume: arrows, bolts, thrown axes.
##
## Movement, piercing and wall collision live here; the damage itself is the
## child [HitboxComponent], exactly like a melee swing. That keeps one damage
## path for the whole game, so crit, life steal and on-hit talents behave the
## same no matter how the blow was delivered.
class_name Projectile
extends Node3D

## The projectile stopped, either by expiring, hitting a wall, or running out
## of pierces.
signal expired(reason: StringName)
## The projectile damaged a target.
signal target_hit(hurtbox: HurtboxComponent, damage_dealt: float)

## Metres per second.
@export var speed: float = 18.0
## Metres travelled before the projectile despawns.
@export var max_range: float = 22.0
## How many enemies it passes through. 0 means it stops at the first target.
@export var pierce_count: int = 0
## Radians per second of homing correction toward the nearest valid target.
@export var homing_strength: float = 0.0
## Metres ahead the projectile looks for walls each step.
@export var wall_check_margin: float = 0.15
## Seconds the trail lingers after the projectile stops.
@export var fade_time: float = 0.12

@onready var hitbox: HitboxComponent = $Hitbox as HitboxComponent
@onready var visual: MeshInstance3D = $Visual as MeshInstance3D

var direction: Vector3 = Vector3.FORWARD
var _distance_travelled: float = 0.0
var _pierces_left: int = 0
var _stopped: bool = false


func _ready() -> void:
	_pierces_left = pierce_count
	if hitbox != null:
		hitbox.hit_landed.connect(_on_hit_landed)
	# Deliberately inert until armed: the spawning ability still has to write
	# damage, crit and status payload onto the hitbox, and a projectile must
	# never resolve a hit with placeholder values.
	set_physics_process(false)


func _physics_process(delta: float) -> void:
	if _stopped:
		return
	var step := speed * delta
	if homing_strength > 0.0:
		_apply_homing(delta)
	var motion := direction * step
	if _would_hit_wall(motion):
		_stop(&"wall")
		return
	global_position += motion
	_distance_travelled += step
	if _distance_travelled >= max_range:
		_stop(&"range")


## Aim the projectile. [param dir] is normalised on the XZ plane.
func launch(origin: Vector3, dir: Vector3) -> void:
	global_position = origin
	var flat := Vector3(dir.x, 0.0, dir.z)
	direction = flat.normalized() if flat.length_squared() > 0.0001 else Vector3.FORWARD
	if direction.length_squared() > 0.0001:
		look_at(global_position + direction, Vector3.UP)


## Make the projectile live. Called by the spawning ability once the hitbox
## carries its final damage profile.
func arm() -> void:
	_pierces_left = pierce_count
	_distance_travelled = 0.0
	_stopped = false
	if hitbox != null:
		hitbox.activate(0.0)
	set_physics_process(true)


## Colour the projectile mesh to match its damage school.
func set_tint(tint: Color) -> void:
	if visual == null:
		return
	var material := StandardMaterial3D.new()
	material.albedo_color = tint
	material.emission_enabled = true
	material.emission = tint
	material.emission_energy_multiplier = 2.0
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	visual.material_override = material


func _apply_homing(delta: float) -> void:
	var target := _find_homing_target()
	if target == null:
		return
	var desired := target.global_position - global_position
	desired.y = 0.0
	if desired.length_squared() < 0.0001:
		return
	var max_turn := homing_strength * delta
	var new_direction := direction.slerp(desired.normalized(), clampf(max_turn, 0.0, 1.0))
	direction = new_direction.normalized()
	look_at(global_position + direction, Vector3.UP)


func _find_homing_target() -> Node3D:
	if hitbox == null or not is_inside_tree():
		return null
	var space := get_world_3d().direct_space_state
	if space == null:
		return null
	var query := PhysicsShapeQueryParameters3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 6.0
	query.shape = sphere
	query.transform = Transform3D(Basis.IDENTITY, global_position)
	query.collision_mask = hitbox.collision_mask
	query.collide_with_areas = true
	query.collide_with_bodies = false
	var results := space.intersect_shape(query, 8)
	var best: Node3D = null
	var best_distance := INF
	for result: Dictionary in results:
		var hurtbox := result.get("collider") as HurtboxComponent
		if hurtbox == null or not hurtbox.is_enabled():
			continue
		var distance := global_position.distance_squared_to(hurtbox.global_position)
		if distance < best_distance:
			best_distance = distance
			best = hurtbox
	return best


func _would_hit_wall(motion: Vector3) -> bool:
	if not is_inside_tree():
		return false
	var space := get_world_3d().direct_space_state
	if space == null:
		return false
	var query := PhysicsRayQueryParameters3D.create(
		global_position, global_position + motion + direction * wall_check_margin
	)
	query.collision_mask = CollisionLayers.WORLD
	query.collide_with_areas = false
	query.collide_with_bodies = true
	return not space.intersect_ray(query).is_empty()


func _on_hit_landed(hurtbox: HurtboxComponent, damage_dealt: float, _info: DamageInfo) -> void:
	target_hit.emit(hurtbox, damage_dealt)
	if _pierces_left > 0:
		_pierces_left -= 1
		return
	_stop(&"hit")


func _stop(reason: StringName) -> void:
	if _stopped:
		return
	_stopped = true
	set_physics_process(false)
	if hitbox != null:
		hitbox.deactivate()
	expired.emit(reason)
	if fade_time <= 0.0:
		queue_free()
		return
	var tween := create_tween()
	tween.tween_property(self, ^"scale", Vector3(0.05, 0.05, 0.05), fade_time)
	tween.tween_callback(queue_free)
