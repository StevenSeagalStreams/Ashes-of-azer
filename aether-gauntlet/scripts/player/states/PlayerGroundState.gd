## Shared behaviour of the states the player can act freely from.
##
## Idle and Move differ only in whether there is movement input, so the input
## polling, ability triggering and dodge/potion handling live here once.
class_name PlayerGroundState
extends State

var player: Player = null


func _on_setup() -> void:
	player = host as Player


func physics_update(delta: float) -> void:
	if player == null:
		return
	player.drive_movement(player.input_direction, 1.0, delta)
	if player.input_direction.length_squared() > 0.001:
		player.face_direction(player.input_direction)
	if _poll_actions():
		return
	_check_movement_transition()


## Route the action buttons. Returns true when an action consumed the frame.
func _poll_actions() -> bool:
	if player == null:
		return false
	if Input.is_action_just_pressed(&"dodge") and player.try_dodge():
		return true
	if Input.is_action_just_pressed(&"use_potion"):
		player.try_use_potion()
	if Input.is_action_just_pressed(&"special_attack") and player.try_cast(
		AbilityComponent.SLOT_SPECIAL
	):
		transition_to(&"Attack")
		return true
	if Input.is_action_pressed(&"secondary_attack") and player.try_cast(
		AbilityComponent.SLOT_SECONDARY
	):
		transition_to(&"Attack")
		return true
	if Input.is_action_pressed(&"primary_attack") and player.try_cast(
		AbilityComponent.SLOT_PRIMARY
	):
		transition_to(&"Attack")
		return true
	return false


## Overridden by Idle and Move to swap between each other.
func _check_movement_transition() -> void:
	pass
