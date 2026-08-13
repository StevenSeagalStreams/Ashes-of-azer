## Fixed-angle chase camera for the top-down view.
##
## The rig follows the player smoothly and leans a short distance toward the
## cursor, which reads as the character looking where you aim without ever
## letting the camera swing around. Screen shake is applied to the child camera
## so shaking never disturbs the follow target.
class_name TopDownCamera
extends Node3D

## Node the rig follows. Assigned by the arena, or found by group at ready.
@export var target: Node3D
## Group searched for a target when none is assigned.
@export var target_group: StringName = &"player"
## Metres behind the target along -Z.
@export var distance: float = 13.0
## Metres above the target.
@export var height: float = 15.0
## Downward pitch of the camera in degrees.
@export_range(20.0, 89.0, 1.0) var pitch_degrees: float = 55.0
## How quickly the rig catches up, in units of "fraction closed per second".
@export var follow_sharpness: float = 9.0
## Maximum metres the view leans toward the cursor.
@export var aim_lead: float = 2.6
## How quickly the lean follows the cursor.
@export var lead_sharpness: float = 5.0
## Multiplier on every shake request.
@export var shake_scale: float = 1.0
## How quickly shake decays, in trauma units per second.
@export var shake_decay: float = 2.4

@onready var camera: Camera3D = $Camera3D as Camera3D

var _lead_offset: Vector3 = Vector3.ZERO
var _trauma: float = 0.0
var _shake_time: float = 0.0
var _base_camera_position: Vector3 = Vector3.ZERO


func _ready() -> void:
	if target == null:
		_acquire_target()
	_configure_camera()
	EventBus.combat_impact.connect(_on_combat_impact)
	EventBus.player_spawned.connect(_on_player_spawned)
	if target != null:
		global_position = target.global_position


func _process(delta: float) -> void:
	if not is_instance_valid(target):
		_acquire_target()
		if target == null:
			return
	_follow(delta)
	_update_shake(delta)


func _configure_camera() -> void:
	if camera == null:
		return
	_base_camera_position = Vector3(0.0, height, distance)
	camera.position = _base_camera_position
	camera.rotation = Vector3(deg_to_rad(-pitch_degrees), 0.0, 0.0)


func _acquire_target() -> void:
	var found := get_tree().get_first_node_in_group(target_group)
	if found is Node3D:
		target = found as Node3D


func _follow(delta: float) -> void:
	var desired := target.global_position + _compute_lead(delta)
	var t := 1.0 - exp(-follow_sharpness * delta)
	global_position = global_position.lerp(desired, clampf(t, 0.0, 1.0))


func _compute_lead(delta: float) -> Vector3:
	if aim_lead <= 0.0:
		return Vector3.ZERO
	var desired := Vector3.ZERO
	if target.has_method(&"get_aim_direction"):
		var direction: Vector3 = target.call(&"get_aim_direction")
		var aim_distance := 0.0
		if "aim_point" in target:
			aim_distance = target.global_position.distance_to(target.get(&"aim_point"))
		var strength := clampf(aim_distance / 12.0, 0.0, 1.0)
		desired = direction * aim_lead * strength
	var t := 1.0 - exp(-lead_sharpness * delta)
	_lead_offset = _lead_offset.lerp(desired, clampf(t, 0.0, 1.0))
	return _lead_offset


# --- Screen shake -----------------------------------------------------------

## Add shake trauma. 0.2 is a light hit, 1.0 is a boss slam.
func add_trauma(amount: float) -> void:
	_trauma = clampf(_trauma + amount * shake_scale, 0.0, 1.0)


func _update_shake(delta: float) -> void:
	if camera == null:
		return
	if _trauma <= 0.0:
		camera.position = _base_camera_position
		camera.rotation.z = 0.0
		return
	_shake_time += delta
	_trauma = maxf(0.0, _trauma - shake_decay * delta)
	# Squaring trauma makes small hits subtle and big ones violent.
	var magnitude := _trauma * _trauma
	var offset := Vector3(
		sin(_shake_time * 47.0) * magnitude * 0.7,
		cos(_shake_time * 39.0) * magnitude * 0.5,
		0.0
	)
	camera.position = _base_camera_position + offset
	camera.rotation.z = sin(_shake_time * 31.0) * magnitude * 0.035


func _on_combat_impact(_world_position: Vector3, weight: float, is_critical: bool) -> void:
	var trauma := weight * 0.35
	if is_critical:
		trauma *= 1.6
	add_trauma(trauma)


func _on_player_spawned(player: Node3D) -> void:
	target = player
	global_position = player.global_position
