## The player is down. Input is ignored until a respawn restores the character.
class_name PlayerDeadState
extends State

var player: Player = null


func _on_setup() -> void:
	player = host as Player


func enter(_message: Dictionary = {}) -> void:
	if player == null:
		return
	player.halt_horizontal()
	player.hurtbox.set_enabled(false)
	if player.body_mesh != null:
		var tween := player.create_tween()
		tween.tween_property(player.body_mesh, ^"rotation:x", deg_to_rad(-85.0), 0.35)


func exit() -> void:
	if player == null:
		return
	player.hurtbox.set_enabled(true)
	if player.body_mesh != null:
		player.body_mesh.rotation.x = 0.0


func physics_update(delta: float) -> void:
	if player != null:
		player.drive_movement(Vector3.ZERO, 0.0, delta)


func can_interrupt() -> bool:
	# Only a forced transition from the respawn flow may leave this state.
	return false
