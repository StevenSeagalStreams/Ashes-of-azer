## The enemy is down: it topples, sinks, and frees itself.
##
## The corpse lingers briefly rather than vanishing, which is what sells a kill
## as an event instead of a despawn.
class_name EnemyDeadState
extends State

var enemy: Enemy = null


func _on_setup() -> void:
	enemy = host as Enemy


func enter(_message: Dictionary = {}) -> void:
	if enemy == null:
		return
	enemy.halt_horizontal()
	enemy.collision_layer = 0
	enemy.collision_mask = 0
	enemy.remove_from_group(&"enemies")

	var tween := enemy.create_tween()
	tween.set_parallel(true)
	if enemy.body_mesh != null:
		tween.tween_property(
			enemy.body_mesh, ^"rotation:x", deg_to_rad(-90.0), 0.25
		).set_ease(Tween.EASE_OUT)
	tween.tween_property(
		enemy, ^"position:y", enemy.position.y - 1.4, enemy.corpse_time
	).set_delay(enemy.corpse_time * 0.4)
	tween.set_parallel(false)
	tween.tween_callback(enemy.queue_free)


func physics_update(_delta: float) -> void:
	# Corpses do not move under their own power; the tween owns them now.
	pass


func can_interrupt() -> bool:
	return false
