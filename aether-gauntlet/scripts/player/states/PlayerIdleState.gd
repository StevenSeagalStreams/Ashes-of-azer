## Standing still: no movement input, free to act.
class_name PlayerIdleState
extends PlayerGroundState


func enter(_message: Dictionary = {}) -> void:
	if player != null:
		player.halt_horizontal()


func _check_movement_transition() -> void:
	if player != null and player.input_direction.length_squared() > 0.001:
		transition_to(&"Move")
