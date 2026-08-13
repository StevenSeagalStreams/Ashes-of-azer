## A brief loss of control after a heavy hit.
##
## Only attacks that carry [member DamageInfo.stagger] cause it, so trash mobs
## chip at the player without ever taking the controller away.
class_name PlayerStaggerState
extends State

var player: Player = null

var _time_left: float = 0.0


func _on_setup() -> void:
	player = host as Player


func enter(message: Dictionary = {}) -> void:
	_time_left = maxf(0.05, float(message.get("duration", 0.25)))
	if player != null:
		player.abilities.cancel_cast(true)


func physics_update(delta: float) -> void:
	if player == null:
		return
	_time_left -= delta
	# No input authority, but knockback and friction still apply.
	player.drive_movement(Vector3.ZERO, 0.0, delta)
	if _time_left <= 0.0:
		machine.travel(&"Idle", {}, true)


func can_interrupt() -> bool:
	return false
