## Closing to attack range, or backing off when too close.
##
## Ranged archetypes keep their distance rather than walking into melee, which
## is what makes a mixed wave force the player to move.
class_name EnemyChaseState
extends State

var enemy: Enemy = null

## Fraction of preferred range the enemy will retreat to when crowded.
@export var retreat_margin: float = 0.6
## Extra metres of tolerance so the enemy does not jitter on the range boundary.
@export var range_slack: float = 0.6


func _on_setup() -> void:
	enemy = host as Enemy


func physics_update(delta: float) -> void:
	if enemy == null or enemy.data == null:
		return
	if not enemy.has_valid_target():
		if enemy.acquire_target() == null:
			transition_to(&"Idle")
			return

	var distance := enemy.distance_to_target()
	var preferred := enemy.data.preferred_range
	enemy.face_position(enemy.target.global_position, delta)

	if distance > preferred + range_slack:
		enemy.move_toward_position(enemy.target.global_position, 1.0, delta)
	elif distance < preferred * retreat_margin:
		var away := enemy.global_position - enemy.target.global_position
		away.y = 0.0
		enemy.drive_movement(away.normalized(), 0.8, delta)
	else:
		enemy.drive_movement(Vector3.ZERO, 0.0, delta)
		_try_attack(distance, preferred)


func _try_attack(distance: float, preferred: float) -> void:
	if enemy.attack_timer > 0.0:
		return
	if distance > preferred + range_slack:
		return
	if enemy.abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY):
		return
	transition_to(&"Attack")
