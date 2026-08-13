## The player is committed to an ability's wind-up, effect and recovery.
##
## The state owns the "committed frames" rule that makes combat readable:
## while the effect has not fired yet the player cannot be pulled out of the
## attack by ordinary transitions. Dodge is the deliberate exception and forces
## its way in, which is what makes it feel like an escape tool.
class_name PlayerAttackState
extends State

var player: Player = null
var _finished: bool = false


func _on_setup() -> void:
	player = host as Player
	if player == null:
		return
	player.abilities.cast_finished.connect(_on_cast_ended)
	player.abilities.cast_cancelled.connect(_on_cast_ended)


func enter(_message: Dictionary = {}) -> void:
	_finished = false
	if player == null:
		return
	player.snap_facing_to_aim()
	# A cast that never started (or already ended) must not trap the player.
	if not player.abilities.is_casting():
		_finished = true


func exit() -> void:
	_finished = false


func physics_update(delta: float) -> void:
	if player == null:
		return
	if _finished or not player.abilities.is_casting():
		_leave()
		return

	var multiplier := player.abilities.get_cast_move_multiplier()
	player.drive_movement(player.input_direction, multiplier, delta)

	if player.abilities.can_turn_while_casting():
		player.face_direction(player.get_aim_direction())

	# Dodge remains available mid-attack; it force-cancels the cast.
	if Input.is_action_just_pressed(&"dodge") and player.try_dodge():
		return
	if Input.is_action_just_pressed(&"use_potion"):
		player.try_use_potion()
	# Queue the next input so a held button chains straight into the follow-up.
	player.abilities.update_buffered_aim(player.aim_point)
	_buffer_next_input()


func can_interrupt() -> bool:
	# Locked until the ability's effect has actually fired.
	if player == null:
		return true
	return not player.abilities.is_casting()


func _buffer_next_input() -> void:
	if Input.is_action_just_pressed(&"special_attack"):
		player.abilities.try_cast(AbilityComponent.SLOT_SPECIAL, player.aim_point)
	elif Input.is_action_pressed(&"secondary_attack"):
		player.abilities.try_cast(AbilityComponent.SLOT_SECONDARY, player.aim_point)
	elif Input.is_action_pressed(&"primary_attack"):
		player.abilities.try_cast(AbilityComponent.SLOT_PRIMARY, player.aim_point)


func _on_cast_ended(_slot: StringName) -> void:
	_finished = true


func _leave() -> void:
	if player == null:
		return
	if player.abilities.is_casting():
		# A buffered cast started as the previous one ended; stay in Attack.
		_finished = false
		return
	if player.input_direction.length_squared() > 0.001:
		transition_to(&"Move")
	else:
		transition_to(&"Idle")
