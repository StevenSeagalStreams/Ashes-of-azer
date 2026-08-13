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

	# Attacking outranks repositioning. A target that is *too close* is still
	# in range, and the enemy must not back out of its own attack window to
	# reach its preferred spacing first: character bodies do not collide, so
	# the player can stand inside a mob, and every melee archetype retreats
	# slower than the player runs. Gating the attack behind the spacing branch
	# would hand the player a permanent safe square.
	if _try_attack(distance, preferred):
		return

	if distance > preferred + range_slack:
		enemy.move_toward_position(enemy.target.global_position, 1.0, delta)
	elif distance < preferred * retreat_margin:
		var away := enemy.global_position - enemy.target.global_position
		away.y = 0.0
		if away.length_squared() < 0.0001:
			# Standing exactly inside the target; any direction will do.
			away = -enemy.global_transform.basis.z
		enemy.drive_movement(away.normalized(), 0.8, delta)
	else:
		enemy.drive_movement(Vector3.ZERO, 0.0, delta)


## Begin an attack if one is available and the target is in range. Returns
## true when the state handed off to [code]Attack[/code].
func _try_attack(distance: float, preferred: float) -> bool:
	if enemy.attack_timer > 0.0:
		return false
	if distance > preferred + range_slack:
		return false
	if enemy.abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY):
		return false
	return transition_to(&"Attack")
