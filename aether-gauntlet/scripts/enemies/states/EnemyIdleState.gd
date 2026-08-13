## Waiting for a target, or drifting back home after leashing.
class_name EnemyIdleState
extends State

var enemy: Enemy = null

## Seconds between target scans, so a wave of fifty does not scan every frame.
@export var scan_interval: float = 0.25

var _scan_timer: float = 0.0


func _on_setup() -> void:
	enemy = host as Enemy


func enter(_message: Dictionary = {}) -> void:
	_scan_timer = randf() * scan_interval


func physics_update(delta: float) -> void:
	if enemy == null:
		return
	var to_home := enemy.home_position - enemy.global_position
	to_home.y = 0.0
	if to_home.length() > 1.0:
		enemy.move_toward_position(enemy.home_position, 0.6, delta)
		enemy.face_position(enemy.home_position, delta)
	else:
		enemy.drive_movement(Vector3.ZERO, 0.0, delta)

	_scan_timer -= delta
	if _scan_timer > 0.0:
		return
	_scan_timer = scan_interval
	if enemy.acquire_target() != null:
		transition_to(&"Chase")
