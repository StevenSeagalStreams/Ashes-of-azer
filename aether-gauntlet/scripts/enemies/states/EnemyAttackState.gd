## Winding up and delivering an attack.
##
## The wind-up is the telegraph: the body flashes for exactly as long as the
## ability takes to fire, so an attentive player can always read the timing and
## dodge through it.
class_name EnemyAttackState
extends State

var enemy: Enemy = null

var _finished: bool = false


func _on_setup() -> void:
	enemy = host as Enemy
	if enemy == null:
		return
	enemy.abilities.cast_finished.connect(_on_cast_ended)
	enemy.abilities.cast_cancelled.connect(_on_cast_ended)


func enter(_message: Dictionary = {}) -> void:
	_finished = false
	if enemy == null or enemy.data == null:
		_finished = true
		return
	if not enemy.has_valid_target():
		_finished = true
		return

	enemy.halt_horizontal()
	var aim := enemy.target.global_position
	if not enemy.abilities.try_cast(AbilityComponent.SLOT_PRIMARY, aim, false):
		_finished = true
		return
	enemy.attack_timer = enemy.data.attack_interval
	var ability := enemy.abilities.get_casting_ability()
	if ability != null:
		enemy.flash_telegraph(ability.windup)


func physics_update(delta: float) -> void:
	if enemy == null:
		return
	if _finished or not enemy.abilities.is_casting():
		_leave()
		return
	enemy.drive_movement(Vector3.ZERO, enemy.abilities.get_cast_move_multiplier(), delta)
	if enemy.abilities.can_turn_while_casting() and enemy.has_valid_target():
		enemy.face_position(enemy.target.global_position, delta)


func can_interrupt() -> bool:
	if enemy == null:
		return true
	return not enemy.abilities.is_casting()


func _on_cast_ended(_slot: StringName) -> void:
	_finished = true


func _leave() -> void:
	if enemy != null and enemy.has_valid_target():
		machine.travel(&"Chase", {}, true)
	else:
		machine.travel(&"Idle", {}, true)
