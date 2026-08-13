## A hostile entity.
##
## Built from the same components as the player — health, stats, status,
## abilities, hurtbox, state machine — so every combat rule applies to both
## sides. What differs is that a small AI state machine supplies the input
## instead of a keyboard.
class_name Enemy
extends CharacterBody3D

## The enemy was configured for an archetype and level.
signal configured(data: EnemyData, mob_level: int)
## The enemy died. [param experience] is the reward for the kill.
signal died(enemy: Enemy, experience: int)

## Degrees per second the body turns toward its target.
@export var turn_speed_degrees: float = 480.0
## Metres per second squared while accelerating.
@export var acceleration: float = 26.0
## Metres per second squared while stopping.
@export var friction: float = 34.0
## Seconds the corpse lingers before it is freed.
@export var corpse_time: float = 1.2
## Metres of separation force applied against other enemies, so packs spread
## out instead of stacking into one silhouette.
@export var separation_strength: float = 4.0
## Metres per second squared that knockback bleeds off at.
@export var knockback_decay: float = 30.0

@onready var stats: StatsComponent = $StatsComponent as StatsComponent
@onready var health: HealthComponent = $HealthComponent as HealthComponent
@onready var status: StatusEffectComponent = $StatusEffectComponent as StatusEffectComponent
@onready var abilities: AbilityComponent = $AbilityComponent as AbilityComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent as HurtboxComponent
@onready var state_machine: StateMachine = $StateMachine as StateMachine
@onready var body_mesh: MeshInstance3D = $Body as MeshInstance3D
@onready var collision_shape: CollisionShape3D = $CollisionShape3D as CollisionShape3D

## The archetype this enemy was built from.
var data: EnemyData = null
## Mob level, set by the wave spawner.
var mob_level: int = 1
## Current aggro target, normally the player.
var target: Node3D = null
## Position the enemy returns to when it leashes.
var home_position: Vector3 = Vector3.ZERO
## Seconds until the next attack attempt is allowed.
var attack_timer: float = 0.0

## The enemy's own locomotion, tracked separately from [member velocity] so
## external motion never feeds back into its steering.
var _locomotion_velocity: Vector3 = Vector3.ZERO
var _knockback_velocity: Vector3 = Vector3.ZERO
var _impulse_velocity: Vector3 = Vector3.ZERO
var _impulse_time_left: float = 0.0
var _body_material: StandardMaterial3D
var _experience_reward: int = 0


func _ready() -> void:
	add_to_group(&"enemies")
	health.set_stats_component(stats)
	status.stats = stats
	status.health = health
	abilities.stats = stats
	abilities.status = status
	abilities.faction = GameEnums.Faction.ENEMY
	abilities.setup(self)
	hurtbox.health = health
	hurtbox.body_target = self
	hurtbox.set_faction(GameEnums.Faction.ENEMY)

	health.died.connect(_on_died)
	home_position = global_position

	if data == null:
		configure(EnemyLibrary.get_enemy(EnemyLibrary.GRUNT), 1)
	state_machine.setup(self)


func _process(delta: float) -> void:
	if attack_timer > 0.0:
		attack_timer = maxf(0.0, attack_timer - delta)


func _physics_process(delta: float) -> void:
	_tick_external_motion(delta)
	move_and_slide()


# --- Configuration ----------------------------------------------------------

## Build the enemy from an archetype at [param level]. Safe to call before or
## after the node enters the tree, which is what lets a spawner pool enemies.
func configure(archetype: EnemyData, level: int) -> void:
	if archetype == null:
		push_error("Enemy.configure called with null archetype")
		return
	data = archetype
	mob_level = maxi(1, level)
	_experience_reward = archetype.get_experience_for_level(mob_level)

	if not is_node_ready():
		# Deferred until _ready has resolved the component references.
		ready.connect(_apply_configuration, CONNECT_ONE_SHOT)
		return
	_apply_configuration()


func _apply_configuration() -> void:
	stats.resource_kind = GameEnums.ResourceKind.MANA
	stats.set_base_stats(data.get_stats_for_level(mob_level))
	stats.refill_resource()
	abilities.set_ability(AbilityComponent.SLOT_PRIMARY, data.attack_ability)
	health.full_restore()
	_apply_appearance()
	configured.emit(data, mob_level)


func _apply_appearance() -> void:
	if body_mesh != null:
		if _body_material == null:
			_body_material = StandardMaterial3D.new()
			body_mesh.material_override = _body_material
		_body_material.albedo_color = data.body_color
		var mesh := body_mesh.mesh as CapsuleMesh
		if mesh != null:
			mesh = mesh.duplicate() as CapsuleMesh
			mesh.radius = data.body_radius
			mesh.height = maxf(data.body_height, data.body_radius * 2.0 + 0.01)
			body_mesh.mesh = mesh
	_resize_body(data.body_radius, data.body_height)


## Resize the physics body and the hurtbox together. Archetypes differ wildly
## in size — a Warden is two thirds taller than a Grunt — so leaving the
## hurtbox at its authored default would make big enemies hittable only around
## the ankles.
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

## Used by hitbox life steal and ability status application.
func get_health_component() -> HealthComponent:
	return health


## Used by ability status application.
func get_status_component() -> StatusEffectComponent:
	return status


## Experience this enemy is worth.
func get_experience_reward() -> int:
	return _experience_reward


# --- Targeting --------------------------------------------------------------

## Find the player when in aggro range. Returns the target, or null.
func acquire_target() -> Node3D:
	var player := get_tree().get_first_node_in_group(&"player")
	if player is Node3D:
		var candidate := player as Node3D
		var candidate_health := _get_target_health(candidate)
		if candidate_health != null and candidate_health.is_dead:
			target = null
			return null
		if global_position.distance_to(candidate.global_position) <= data.aggro_radius:
			target = candidate
			return target
	target = null
	return null


## True when the current target is alive and inside the leash radius.
func has_valid_target() -> bool:
	if not is_instance_valid(target):
		return false
	var target_health := _get_target_health(target)
	if target_health != null and target_health.is_dead:
		return false
	return home_position.distance_to(global_position) <= data.leash_radius


## Metres to the current target, or INF when there is none.
func distance_to_target() -> float:
	if not is_instance_valid(target):
		return INF
	return global_position.distance_to(target.global_position)


func _get_target_health(node: Node3D) -> HealthComponent:
	if node.has_method(&"get_health_component"):
		return node.call(&"get_health_component") as HealthComponent
	return node.get_node_or_null(^"HealthComponent") as HealthComponent


# --- Movement ---------------------------------------------------------------

## Steer toward [param destination] at [param speed_multiplier] of move speed.
func move_toward_position(destination: Vector3, speed_multiplier: float, delta: float) -> void:
	var to_target := destination - global_position
	to_target.y = 0.0
	var direction := to_target.normalized() if to_target.length_squared() > 0.01 else Vector3.ZERO
	direction += _compute_separation()
	drive_movement(direction, speed_multiplier, delta)


## Drive horizontal velocity toward a direction.
func drive_movement(direction: Vector3, speed_multiplier: float, delta: float) -> void:
	var speed := stats.get_stat(GameEnums.Stat.MOVE_SPEED) * maxf(0.0, speed_multiplier)
	if direction.length_squared() > 0.001 and speed > 0.0:
		_locomotion_velocity = _locomotion_velocity.move_toward(
			direction.normalized() * speed, acceleration * delta
		)
	else:
		_locomotion_velocity = _locomotion_velocity.move_toward(
			Vector3.ZERO, friction * delta
		)
	var external := get_external_velocity()
	velocity.x = _locomotion_velocity.x + external.x
	velocity.z = _locomotion_velocity.z + external.z
	_apply_gravity(delta)


## Stop horizontal movement immediately.
func halt_horizontal() -> void:
	_locomotion_velocity = Vector3.ZERO
	velocity.x = 0.0
	velocity.z = 0.0


## Knockback plus any active lunge, as a single offset.
func get_external_velocity() -> Vector3:
	return _knockback_velocity + _impulse_velocity


func _apply_gravity(delta: float) -> void:
	if is_on_floor():
		velocity.y = minf(velocity.y, 0.0)
		return
	velocity.y -= ProjectSettings.get_setting("physics/3d/default_gravity", 24.0) * delta


## Push apart from nearby enemies so a pack does not collapse into one point.
func _compute_separation() -> Vector3:
	if separation_strength <= 0.0:
		return Vector3.ZERO
	var push := Vector3.ZERO
	for other in get_tree().get_nodes_in_group(&"enemies"):
		if other == self or not (other is Node3D):
			continue
		var other_node := other as Node3D
		var offset := global_position - other_node.global_position
		offset.y = 0.0
		var distance := offset.length()
		if distance > 0.001 and distance < 1.6:
			push += offset.normalized() * (1.6 - distance)
	return push * separation_strength * 0.25


## Turn the body toward [param point] over time.
func face_position(point: Vector3, delta: float) -> void:
	var to_point := point - global_position
	to_point.y = 0.0
	if to_point.length_squared() < 0.0001:
		return
	var desired := to_point.normalized()
	var current := -global_transform.basis.z
	current.y = 0.0
	if current.length_squared() < 0.0001:
		return
	current = current.normalized()
	var angle := current.signed_angle_to(desired, Vector3.UP)
	if is_zero_approx(angle):
		return
	var max_turn := deg_to_rad(turn_speed_degrees) * delta
	var forward := current.rotated(Vector3.UP, clampf(angle, -max_turn, max_turn))
	look_at(global_position + forward, Vector3.UP)


# --- Reactions --------------------------------------------------------------

## Called by [HurtboxComponent] when a blow carries knockback.
func apply_knockback(impulse: Vector3) -> void:
	if data != null and data.is_boss:
		# Bosses are anchored; knockback would break their telegraph spacing.
		return
	_knockback_velocity = Vector3(impulse.x, 0.0, impulse.z)


## Called by [HurtboxComponent] when a blow staggers.
func apply_stagger(seconds: float) -> void:
	if health.is_dead or data == null:
		return
	var scaled := seconds * data.stagger_resistance
	if scaled <= 0.0:
		return
	state_machine.travel(&"Stagger", {"duration": scaled}, true)


## Short scripted movement used by lunging attacks. [param motion_velocity] is
## a speed held for [param seconds], and it replaces any lunge already running
## rather than adding to it.
func apply_impulse_motion(motion_velocity: Vector3, seconds: float) -> void:
	_impulse_velocity = Vector3(motion_velocity.x, 0.0, motion_velocity.z)
	_impulse_time_left = maxf(0.0, seconds)


## Age the external offsets by one physics step. This only ever reduces them;
## they are layered onto velocity in [method drive_movement], never
## accumulated into it.
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


## Flash the body white, used as the attack telegraph.
func flash_telegraph(duration: float) -> void:
	if _body_material == null or duration <= 0.0:
		return
	_body_material.emission_enabled = true
	_body_material.emission = Color(1.0, 0.85, 0.5)
	var tween := create_tween()
	tween.tween_method(_set_emission_energy, 0.0, 3.0, duration * 0.7)
	tween.tween_method(_set_emission_energy, 3.0, 0.0, duration * 0.3)


func _set_emission_energy(value: float) -> void:
	if _body_material != null:
		_body_material.emission_energy_multiplier = value


# --- Death ------------------------------------------------------------------

func _on_died(_info: DamageInfo) -> void:
	abilities.cancel_cast(false)
	status.clear_all()
	hurtbox.set_enabled(false)
	state_machine.travel(&"Dead", {}, true)
	died.emit(self, _experience_reward)
	EventBus.experience_gained.emit(_experience_reward, GameState.experience)
