## Reeling from a heavy hit. Movement and attacks are suspended.
class_name EnemyStaggerState
extends State

var enemy: Enemy = null

var _time_left: float = 0.0


func _on_setup() -> void:
	enemy = host as Enemy


func enter(message: Dictionary = {}) -> void:
	_time_left = maxf(0.05, float(message.get("duration", 0.3)))
	if enemy != null:
		enemy.abilities.cancel_cast(false)


func physics_update(delta: float) -> void:
	if enemy == null:
		return
	_time_left -= delta
	enemy.drive_movement(Vector3.ZERO, 0.0, delta)
	if _time_left <= 0.0:
		if enemy.has_valid_target():
			machine.travel(&"Chase", {}, true)
		else:
			machine.travel(&"Idle", {}, true)


func can_interrupt() -> bool:
	return false
