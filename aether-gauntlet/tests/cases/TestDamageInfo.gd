## Damage packet semantics: faction filtering, copying and knockback geometry.
extends TestCase


func get_suite_name() -> String:
	return "DamageInfo"


func test_faction_filter_blocks_friendly_fire() -> void:
	var info := DamageInfo.new(10.0, GameEnums.DamageType.PHYSICAL, GameEnums.Faction.PLAYER)
	assert_true(info.can_affect(GameEnums.Faction.ENEMY), "player damage hits enemies")
	assert_false(info.can_affect(GameEnums.Faction.PLAYER), "player damage spares the player")
	assert_false(info.can_affect(GameEnums.Faction.NEUTRAL), "neutrals are never damaged")


func test_enemy_damage_only_hits_the_player() -> void:
	var info := DamageInfo.new(10.0, GameEnums.DamageType.FIRE, GameEnums.Faction.ENEMY)
	assert_true(info.can_affect(GameEnums.Faction.PLAYER), "enemy damage hits the player")
	assert_false(info.can_affect(GameEnums.Faction.ENEMY), "enemies do not hit each other")


func test_copy_is_independent() -> void:
	var info := DamageInfo.new(25.0, GameEnums.DamageType.FROST, GameEnums.Faction.PLAYER)
	info.status_effects = [StatusEffectLibrary.CHILL]
	info.knockback = 4.0
	info.ability_id = &"test_ability"

	var clone := info.copy()
	assert_eq(clone.amount, 25.0, "amount copied")
	assert_eq(clone.damage_type, GameEnums.DamageType.FROST, "type copied")
	assert_eq(clone.ability_id, &"test_ability", "ability id copied")
	assert_eq(clone.status_effects.size(), 1, "status list copied")

	clone.amount = 1.0
	clone.status_effects.append(StatusEffectLibrary.BURN)
	assert_eq(info.amount, 25.0, "mutating the copy leaves the original alone")
	assert_eq(info.status_effects.size(), 1, "status list is not shared")


func test_knockback_direction_points_away_from_origin() -> void:
	var info := DamageInfo.new(10.0)
	info.origin = Vector3(0.0, 0.0, 0.0)

	var direction := info.get_knockback_direction(Vector3(3.0, 5.0, 0.0))
	assert_almost_eq(direction.x, 1.0, 0.001, "pushed along +X")
	assert_almost_eq(direction.y, 0.0, 0.001, "knockback stays on the ground plane")
	assert_almost_eq(direction.length(), 1.0, 0.001, "direction is normalised")


func test_knockback_direction_is_zero_at_the_origin() -> void:
	var info := DamageInfo.new(10.0)
	info.origin = Vector3(2.0, 0.0, 2.0)
	assert_eq(
		info.get_knockback_direction(Vector3(2.0, 0.0, 2.0)),
		Vector3.ZERO,
		"a hit landing exactly on the origin has no push direction"
	)
