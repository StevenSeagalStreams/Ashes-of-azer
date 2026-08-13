## The dodge roll: a fixed-length burst of movement with invulnerability
## frames at the front of it.
##
## The i-frame window is shorter than the roll itself, so dodging *through* an
## attack works and dodging late does not. That gap is the skill expression the
## whole defensive game rests on.
class_name PlayerDodgeState
extends State

var player: Player = null

var _time_left: float = 0.0
var _iframes_left: float = 0.0
var _direction: Vector3 = Vector3.FORWARD
var _speed: float = 0.0
var _invulnerable: bool = false


func _on_setup() -> void:
	player = host as Player


func enter(message: Dictionary = {}) -> void:
	if player == null or player.class_data == null:
		return
	var data := player.class_data
	_direction = message.get("direction", player.get_aim_direction())
	if _direction.length_squared() < 0.0001:
		_direction = player.get_aim_direction()
	_direction = Vector3(_direction.x, 0.0, _direction.z).normalized()

	_time_left = maxf(0.05, data.dodge_duration)
	_iframes_left = clampf(data.dodge_iframe_time, 0.0, _time_left)
	_speed = data.dodge_distance / _time_left

	player.face_direction(_direction)
	player.set_horizontal_velocity(_direction * _speed)

	if _iframes_left > 0.0:
		player.health.add_invulnerability()
		_invulnerable = true


func exit() -> void:
	_release_invulnerability()


func physics_update(delta: float) -> void:
	if player == null:
		return
	_time_left -= delta
	if _iframes_left > 0.0:
		_iframes_left -= delta
		if _iframes_left <= 0.0:
			_release_invulnerability()

	# Ease out over the roll so it lands rather than stopping dead.
	var t := clampf(_time_left / maxf(0.01, player.class_data.dodge_duration), 0.0, 1.0)
	var speed := _speed * lerpf(0.45, 1.0, t)
	player.set_horizontal_velocity(_direction * speed)

	if _time_left <= 0.0:
		_finish()


func can_interrupt() -> bool:
	# The roll is fully committed; only a forced transition (death) cuts it.
	return false


func _release_invulnerability() -> void:
	if not _invulnerable or player == null:
		return
	_invulnerable = false
	player.health.remove_invulnerability()


func _finish() -> void:
	_release_invulnerability()
	if player.input_direction.length_squared() > 0.001:
		machine.travel(&"Move", {}, true)
	else:
		machine.travel(&"Idle", {}, true)
