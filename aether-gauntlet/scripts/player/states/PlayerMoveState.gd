## Running under WASD control, free to act.
class_name PlayerMoveState
extends PlayerGroundState


func _check_movement_transition() -> void:
	if player != null and player.input_direction.length_squared() <= 0.001:
		transition_to(&"Idle")
