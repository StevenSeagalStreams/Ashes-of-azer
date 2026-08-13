## Mitigation, invulnerability reference counting, healing and death.
extends TestCase

var health: HealthComponent
var stats: StatsComponent


func get_suite_name() -> String:
	return "HealthComponent"


func before_each() -> void:
	stats = StatsComponent.new()
	stats.name = "StatsComponent"
	own(stats)
	health = HealthComponent.new()
	health.name = "HealthComponent"
	own(health)


func _install(with_stats: bool = true) -> void:
	track(stats)
	if with_stats:
		health.stats = stats
	track(health)


func _hit(amount: float, type: GameEnums.DamageType = GameEnums.DamageType.PHYSICAL) -> DamageInfo:
	return DamageInfo.new(amount, type, GameEnums.Faction.ENEMY)


func test_max_health_follows_the_stat_sheet() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 250.0})
	_install()
	assert_almost_eq(health.get_max_health(), 250.0, 0.001, "maximum read from stats")
	assert_almost_eq(health.current_health, 250.0, 0.001, "spawns at full health")


func test_damage_is_reduced_by_armor() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 1000.0, GameEnums.Stat.ARMOR: 400.0})
	_install()
	var dealt := health.apply_damage(_hit(100.0))
	assert_almost_eq(dealt, 50.0, 0.001, "400 armour halves a 100 damage hit")
	assert_almost_eq(health.current_health, 950.0, 0.001, "health reflects the mitigated hit")


func test_true_damage_ignores_armor() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 1000.0, GameEnums.Stat.ARMOR: 400.0})
	_install()
	var dealt := health.apply_damage(_hit(100.0, GameEnums.DamageType.TRUE))
	assert_almost_eq(dealt, 100.0, 0.001, "true damage bypasses mitigation")


func test_applied_amount_is_written_back_to_the_packet() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 500.0, GameEnums.Stat.ARMOR: 400.0})
	_install()
	var info := _hit(80.0)
	health.apply_damage(info)
	assert_almost_eq(info.applied_amount, 40.0, 0.001, "floating numbers read the real value")
	assert_true(info.was_absorbed, "packet is marked consumed")


func test_invulnerability_is_reference_counted() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 100.0})
	_install()
	health.add_invulnerability()
	health.add_invulnerability()
	assert_true(health.is_invulnerable(), "two sources active")

	assert_almost_eq(health.apply_damage(_hit(50.0)), 0.0, 0.001, "damage is negated")
	assert_almost_eq(health.current_health, 100.0, 0.001, "health untouched")

	health.remove_invulnerability()
	assert_true(health.is_invulnerable(), "one source is still holding it")

	health.remove_invulnerability()
	assert_false(health.is_invulnerable(), "released once both sources let go")
	assert_gt(health.apply_damage(_hit(50.0)), 0.0, "damage lands again")


func test_removing_more_invulnerability_than_was_added_does_not_underflow() -> void:
	_install()
	health.remove_invulnerability()
	health.remove_invulnerability()
	health.add_invulnerability()
	assert_true(health.is_invulnerable(), "a single add still grants immunity")


func test_timed_invulnerability_expires() -> void:
	_install()
	health.grant_timed_invulnerability(0.2)
	assert_true(health.is_invulnerable(), "granted")
	health._process(0.1)
	assert_true(health.is_invulnerable(), "still inside the window")
	health._process(0.2)
	assert_false(health.is_invulnerable(), "window elapsed")


func test_healing_is_clamped_and_reports_the_real_amount() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 100.0})
	_install()
	health.apply_damage(_hit(30.0))
	assert_almost_eq(health.heal(10.0), 10.0, 0.001, "partial heal")
	assert_almost_eq(health.heal(500.0), 20.0, 0.001, "overheal is trimmed to the deficit")
	assert_almost_eq(health.current_health, 100.0, 0.001, "capped at maximum")


func test_heal_percent_uses_maximum_health() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 200.0})
	_install()
	health.apply_damage(_hit(150.0))
	health.heal_percent(0.25)
	assert_almost_eq(health.current_health, 100.0, 0.001, "25% of 200 is 50")


func test_death_fires_once_and_blocks_further_damage() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 40.0})
	_install()
	# GDScript lambdas capture locals by value, so the counter lives in a
	# Dictionary — a reference type the closure can actually mutate.
	var seen: Dictionary = {"deaths": 0}
	health.died.connect(func(_info: DamageInfo) -> void: seen["deaths"] += 1)

	health.apply_damage(_hit(100.0))
	assert_true(health.is_dead, "dead")
	assert_almost_eq(health.current_health, 0.0, 0.001, "health floors at zero")
	assert_eq(seen["deaths"], 1, "died fires once")

	assert_almost_eq(health.apply_damage(_hit(100.0)), 0.0, 0.001, "corpses take no damage")
	assert_eq(seen["deaths"], 1, "and do not die twice")


func test_kill_bypasses_invulnerability() -> void:
	_install()
	health.add_invulnerability()
	health.kill()
	assert_true(health.is_dead, "scripted kills always land")


func test_full_restore_revives() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 80.0})
	_install()
	health.kill()
	health.full_restore()
	assert_false(health.is_dead, "revived")
	assert_almost_eq(health.current_health, 80.0, 0.001, "back to full")
	assert_false(health.is_invulnerable(), "stale invulnerability is cleared")


func test_immortal_entities_stop_at_one_hit_point() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 100.0})
	health.immortal = true
	_install()
	health.apply_damage(_hit(10000.0))
	assert_almost_eq(health.current_health, 1.0, 0.001, "left alive on purpose")
	assert_false(health.is_dead, "training dummies never die")


func test_shrinking_maximum_health_trims_current_health() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 300.0})
	_install()
	assert_almost_eq(health.current_health, 300.0, 0.001, "starts full")
	stats.set_base_stat(GameEnums.Stat.MAX_HEALTH, 100.0)
	assert_almost_eq(
		health.current_health, 100.0, 0.001, "unequipping health gear cannot leave you over-full"
	)


func test_health_ratio() -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 200.0})
	_install()
	health.apply_damage(_hit(50.0))
	assert_almost_eq(health.get_health_ratio(), 0.75, 0.001, "ratio for the HUD orb")
