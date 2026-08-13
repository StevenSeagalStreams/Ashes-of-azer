## The player character.
##
## Deliberately class-agnostic: every number that differs between Warrior,
## Wizard and Ranger arrives from a [PlayerClassData]. What lives here is the
## shared feel — camera-relative WASD with acceleration, cursor aiming, the
## dodge, the potion, and the wiring between the components and the state
## machine that decides which of those is allowed right now.
class_name Player
extends CharacterBody3D

## The player finished being configured for [param class_data].
signal class_applied(class_data: PlayerClassData)
## A dodge began.
signal dodge_started()
## The dodge came off cooldown.
signal dodge_ready()
## A potion was drunk. [param charges_left] is what remains.
signal potion_consumed(charges_left: int)
## The potion could not be drunk. [param reason] is [code]&"empty"[/code] or
## [code]&"cooldown"[/code].
signal potion_failed(reason: StringName)

## Metres per second squared while accelerating from a standstill.
@export var acceleration: float = 60.0
## Metres per second squared while stopping.
@export var friction: float = 70.0
## Degrees per second the body turns toward its facing target.
@export var turn_speed_degrees: float = 900.0
## Metres per second squared that knockback bleeds off at.
@export var knockback_decay: float = 40.0
## Seconds an incoming hit locks movement when it staggers.
@export var max_stagger_time: float = 0.6

@onready var stats: StatsComponent = $StatsComponent as StatsComponent
@onready var health: HealthComponent = $HealthComponent as HealthComponent
@onready var status: StatusEffectComponent = $StatusEffectComponent as StatusEffectComponent
@onready var abilities: AbilityComponent = $AbilityComponent as AbilityComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent as HurtboxComponent
@onready var state_machine: StateMachine = $StateMachine as StateMachine
@onready var body_mesh: MeshInstance3D = $Body as MeshInstance3D
@onready var collision_shape: CollisionShape3D = $CollisionShape3D as CollisionShape3D

## The archetype currently applied.
var class_data: PlayerClassData = null
## Ground position under the mouse cursor, refreshed every frame.
var aim_point: Vector3 = Vector3.ZERO
## Movement intent from WASD, camera-relative and normalised.
var input_direction: Vector3 = Vector3.ZERO
## Direction the body is turning toward.
var facing_direction: Vector3 = Vector3.FORWARD

var _dodge_cooldown_left: float = 0.0
var _potion_cooldown_left: float = 0.0

## The character's own locomotion, tracked separately from [member velocity] so
## that external motion can be layered on top without ever feeding back into
## the controller's acceleration.
var _locomotion_velocity: Vector3 = Vector3.ZERO
## Decaying push from a blow that carried knockback.
var _knockback_velocity: Vector3 = Vector3.ZERO
## Fixed-speed offset held for the duration of an ability's lunge.
var _impulse_velocity: Vector3 = Vector3.ZERO
var _impulse_time_left: float = 0.0
var _camera: Camera3D = null
var _body_material: StandardMaterial3D


func _ready() -> void:
	add_to_group(&"player")
	health.set_stats_component(stats)
	status.stats = stats
	status.health = health
	abilities.stats = stats
	abilities.status = status
	abilities.faction = GameEnums.Faction.PLAYER
	hurtbox.health = health
	hurtbox.body_target = self
	hurtbox.set_faction(GameEnums.Faction.PLAYER)

	abilities.setup(self)
	apply_class(GameState.get_class_data(), GameState.level)

	health.died.connect(_on_died)
	health.health_changed.connect(_on_health_changed)
	stats.resource_changed.connect(_on_resource_changed)

	state_machine.setup(self)
	facing_direction = -global_transform.basis.z
	EventBus.player_spawned.emit(self)


func _process(delta: float) -> void:
	_camera = get_viewport().get_camera_3d()
	read_movement_input()
	_update_aim_point()
	_tick_timers(delta)


func _physics_process(delta: float) -> void:
	_tick_external_motion(delta)
	move_and_slide()
	_apply_turning(delta)


# --- Class configuration ----------------------------------------------------

## Apply an archetype at [param level]. Safe to call at runtime — it is how the
## class-select screen and the respec flow reconfigure the same player node.
func apply_class(data: PlayerClassData, level: int = 1) -> void:
	if data == null:
		push_error("Player.apply_class called with null class data")
		return
	class_data = data
	stats.resource_kind = data.resource_kind
	stats.start_resource_full = data.resource_kind != GameEnums.ResourceKind.RAGE
	stats.set_base_stats(data.get_stats_for_level(level))
	stats.current_resource = (
		stats.get_stat(GameEnums.Stat.MAX_RESOURCE) if stats.start_resource_full else 0.0
	)
	abilities.set_kit(data.primary_ability, data.secondary_ability, data.special_ability)
	health.full_restore()
	_apply_body_appearance(data)
	class_applied.emit(data)
	EventBus.player_health_changed.emit(health.current_health, health.get_max_health())
	EventBus.player_resource_changed.emit(
		stats.current_resource, stats.get_stat(GameEnums.Stat.MAX_RESOURCE), data.resource_kind
	)


func _apply_body_appearance(data: PlayerClassData) -> void:
	if body_mesh != null:
		if _body_material == null:
			_body_material = StandardMaterial3D.new()
			body_mesh.material_override = _body_material
		_body_material.albedo_color = data.body_color
	_resize_body(data.body_radius, data.body_height)


## Resize the physics body and the hurtbox together, so a class with a
## different silhouette is struck exactly where it looks like it should be.
func _resize_body(radius: float, height: float) -> void:
	var body_height := maxf(radius * 2.0 + 0.01, height)
	var centre := body_height * 0.5

	var body_shape := collision_shape.shape as CapsuleShape3D
	if body_shape != null:
		body_shape = body_shape.duplicate() as CapsuleShape3D
		body_shape.radius = radius
		body_shape.height = body_height
		collision_shape.shape = body_shape
	collision_shape.position.y = centre

	var hurt_shape := _find_collision_shape(hurtbox)
	if hurt_shape != null:
		var capsule := hurt_shape.shape as CapsuleShape3D
		if capsule != null:
			capsule = capsule.duplicate() as CapsuleShape3D
			capsule.radius = radius
			capsule.height = maxf(body_height, radius * 2.0 + 0.01)
			hurt_shape.shape = capsule
		hurt_shape.position.y = centre

	if body_mesh != null:
		body_mesh.position.y = centre


func _find_collision_shape(parent: Node) -> CollisionShape3D:
	if parent == null:
		return null
	for child in parent.get_children():
		if child is CollisionShape3D:
			return child as CollisionShape3D
	return null


# --- Component accessors ----------------------------------------------------

## Used by [HitboxComponent] life steal and by ability status application.
func get_health_component() -> HealthComponent:
	return health


## Used by ability status application.
func get_status_component() -> StatusEffectComponent:
	return status


# --- Movement ---------------------------------------------------------------

## Recompute [member input_direction] from the movement actions, rotated into
## camera space so "W" always means "away from the camera".
func read_movement_input() -> Vector3:
	var raw := Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
	if raw.length_squared() < 0.01:
		input_direction = Vector3.ZERO
		return input_direction
	var basis_yaw := 0.0
	if _camera != null:
		basis_yaw = _camera.global_rotation.y
	var direction := Vector3(raw.x, 0.0, raw.y).rotated(Vector3.UP, basis_yaw)
	input_direction = direction.normalized()
	return input_direction


## Drive horizontal velocity toward [param target_direction] at
## [param speed_multiplier] of the character's movement speed.
func drive_movement(target_direction: Vector3, speed_multiplier: float, delta: float) -> void:
	var speed := stats.get_stat(GameEnums.Stat.MOVE_SPEED) * maxf(0.0, speed_multiplier)
	if target_direction.length_squared() > 0.001 and speed > 0.0:
		_locomotion_velocity = _locomotion_velocity.move_toward(
			target_direction.normalized() * speed, acceleration * delta
		)
	else:
		_locomotion_velocity = _locomotion_velocity.move_toward(
			Vector3.ZERO, friction * delta
		)
	_compose_velocity(delta)


## Set horizontal velocity outright, used by the dodge. External motion is
## deliberately ignored: a roll is authoritative over knockback and lunges.
func set_horizontal_velocity(value: Vector3) -> void:
	_locomotion_velocity = Vector3(value.x, 0.0, value.z)
	velocity.x = _locomotion_velocity.x
	velocity.z = _locomotion_velocity.z


## Stop horizontal movement immediately.
func halt_horizontal() -> void:
	_locomotion_velocity = Vector3.ZERO
	velocity.x = 0.0
	velocity.z = 0.0


## Knockback plus any active ability lunge, as a single offset.
func get_external_velocity() -> Vector3:
	return _knockback_velocity + _impulse_velocity


## Cancel every external push. The dodge uses this so a roll always goes where
## the player aimed it.
func clear_external_motion() -> void:
	_knockback_velocity = Vector3.ZERO
	_impulse_velocity = Vector3.ZERO
	_impulse_time_left = 0.0


## Lay external motion on top of locomotion. Because both are tracked
## separately, neither can feed back into the other frame after frame.
func _compose_velocity(delta: float) -> void:
	var external := get_external_velocity()
	velocity.x = _locomotion_velocity.x + external.x
	velocity.z = _locomotion_velocity.z + external.z
	apply_gravity(delta)


## Apply gravity for one physics step. States that set velocity directly (the
## dodge) call this themselves so the character still falls.
func apply_gravity(delta: float) -> void:
	if is_on_floor():
		velocity.y = minf(velocity.y, 0.0)
		return
	velocity.y -= ProjectSettings.get_setting("physics/3d/default_gravity", 24.0) * delta


## Point the body at [param direction] over the next frames.
func face_direction(direction: Vector3) -> void:
	var flat := Vector3(direction.x, 0.0, direction.z)
	if flat.length_squared() > 0.0001:
		facing_direction = flat.normalized()


## Point the body at the cursor immediately, used when an attack starts.
func snap_facing_to_aim() -> void:
	var to_aim := aim_point - global_position
	to_aim.y = 0.0
	if to_aim.length_squared() > 0.0001:
		facing_direction = to_aim.normalized()
		var target := global_position + facing_direction
		look_at(target, Vector3.UP)


func _apply_turning(delta: float) -> void:
	if facing_direction.length_squared() < 0.0001:
		return
	var current := -global_transform.basis.z
	current.y = 0.0
	if current.length_squared() < 0.0001:
		return
	current = current.normalized()
	var angle := current.signed_angle_to(facing_direction, Vector3.UP)
	if is_zero_approx(angle):
		return
	var max_turn := deg_to_rad(turn_speed_degrees) * delta
	var new_forward := current.rotated(Vector3.UP, clampf(angle, -max_turn, max_turn))
	look_at(global_position + new_forward, Vector3.UP)


# --- Reactions --------------------------------------------------------------

## Called by [HurtboxComponent] when a blow carries knockback.
func apply_knockback(impulse: Vector3) -> void:
	_knockback_velocity = Vector3(impulse.x, 0.0, impulse.z)


## Called by [HurtboxComponent] when a blow staggers.
func apply_stagger(seconds: float) -> void:
	if health.is_dead:
		return
	state_machine.travel(
		&"Stagger", {"duration": minf(seconds, max_stagger_time)}, true
	)


## Short scripted movement used by lunging abilities. [param motion_velocity]
## is a speed held for [param seconds], so the distance covered is simply
## speed × seconds. It replaces any lunge already running rather than adding
## to it, which is what stops chained attacks from compounding.
func apply_impulse_motion(motion_velocity: Vector3, seconds: float) -> void:
	_impulse_velocity = Vector3(motion_velocity.x, 0.0, motion_velocity.z)
	_impulse_time_left = maxf(0.0, seconds)


## Age the external offsets by one physics step. This only ever *reduces*
## them; the offsets are layered onto velocity in [method _compose_velocity]
## and are never accumulated into it.
func _tick_external_motion(delta: float) -> void:
	if _impulse_time_left > 0.0:
		_impulse_time_left = maxf(0.0, _impulse_time_left - delta)
		if _impulse_time_left <= 0.0:
			_impulse_velocity = Vector3.ZERO
	if _knockback_velocity.length_squared() > 0.000001:
		_knockback_velocity = _knockback_velocity.move_toward(
			Vector3.ZERO, knockback_decay * delta
		)
	else:
		_knockback_velocity = Vector3.ZERO


# --- Aiming -----------------------------------------------------------------

func _update_aim_point() -> void:
	if _camera == null:
		aim_point = global_position - global_transform.basis.z * 5.0
		return
	var viewport := get_viewport()
	if viewport == null:
		return
	var mouse := viewport.get_mouse_position()
	var ray_origin := _camera.project_ray_origin(mouse)
	var ray_direction := _camera.project_ray_normal(mouse)
	var ground := Plane(Vector3.UP, global_position.y)
	var hit: Variant = ground.intersects_ray(ray_origin, ray_direction)
	if hit is Vector3:
		aim_point = hit


## Normalised direction from the player to the cursor.
func get_aim_direction() -> Vector3:
	var delta := aim_point - global_position
	delta.y = 0.0
	if delta.length_squared() < 0.0001:
		return -global_transform.basis.z
	return delta.normalized()


# --- Actions ----------------------------------------------------------------

## Try to cast an ability slot at the cursor. Returns true when the cast began.
func try_cast(slot: StringName) -> bool:
	if health.is_dead:
		return false
	var started := abilities.try_cast(slot, aim_point)
	if started:
		snap_facing_to_aim()
	return started


## True when the dodge is available right now.
func can_dodge() -> bool:
	return (
		not health.is_dead
		and _dodge_cooldown_left <= 0.0
		and not status.is_incapacitated()
	)


## Begin a dodge. Returns false when it is on cooldown.
func try_dodge() -> bool:
	if not can_dodge():
		return false
	var direction := input_direction
	if direction.length_squared() < 0.001:
		direction = get_aim_direction()
	_dodge_cooldown_left = class_data.dodge_cooldown
	# Dodge outranks everything: it force-cancels casts and stagger alike, and
	# clears any push so the roll goes exactly where it was aimed.
	abilities.cancel_cast(true)
	clear_external_motion()
	state_machine.travel(&"Dodge", {"direction": direction}, true)
	dodge_started.emit()
	return true


## Seconds left before the dodge is usable.
func get_dodge_cooldown_remaining() -> float:
	return _dodge_cooldown_left


## Drink a health potion. Returns false when empty or on cooldown.
func try_use_potion() -> bool:
	if health.is_dead:
		return false
	if _potion_cooldown_left > 0.0:
		potion_failed.emit(&"cooldown")
		EventBus.toast_requested.emit("Potion still on cooldown")
		return false
	if not GameState.consume_potion_charge():
		potion_failed.emit(&"empty")
		EventBus.toast_requested.emit("No potions left")
		return false
	_potion_cooldown_left = GameState.potion_cooldown
	health.heal_percent(GameState.potion_heal_fraction)
	potion_consumed.emit(GameState.potion_charges)
	return true


## Seconds left before another potion can be drunk.
func get_potion_cooldown_remaining() -> float:
	return _potion_cooldown_left


func _tick_timers(delta: float) -> void:
	if _dodge_cooldown_left > 0.0:
		_dodge_cooldown_left = maxf(0.0, _dodge_cooldown_left - delta)
		if _dodge_cooldown_left == 0.0:
			dodge_ready.emit()
	if _potion_cooldown_left > 0.0:
		_potion_cooldown_left = maxf(0.0, _potion_cooldown_left - delta)


# --- Signal handlers --------------------------------------------------------

func _on_health_changed(current: float, maximum: float) -> void:
	EventBus.player_health_changed.emit(current, maximum)


func _on_resource_changed(current: float, maximum: float) -> void:
	EventBus.player_resource_changed.emit(current, maximum, stats.resource_kind)


func _on_died(_info: DamageInfo) -> void:
	abilities.cancel_cast(false)
	status.clear_all()
	state_machine.travel(&"Dead", {}, true)
	EventBus.player_died.emit()
