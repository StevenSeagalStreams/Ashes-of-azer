## Stat maths, modifier bookkeeping and the class resource pool.
extends TestCase

var stats: StatsComponent


func get_suite_name() -> String:
	return "StatsComponent"


func before_each() -> void:
	stats = StatsComponent.new()
	stats.name = "StatsComponent"
	own(stats)


func _install() -> void:
	track(stats)


func test_defaults_are_applied_on_ready() -> void:
	_install()
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MAX_HEALTH), 100.0, 0.001, "default max health"
	)
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.ATTACK_SPEED), 1.0, 0.001, "default attack speed"
	)


func test_flat_and_percent_modifiers_compose() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.ATTACK_POWER, 100.0)
	stats.add_modifier_source(&"gear", {GameEnums.Stat.ATTACK_POWER: 50.0}, {})
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.ATTACK_POWER), 150.0, 0.001, "flat is added first"
	)

	stats.add_modifier_source(&"talent", {}, {GameEnums.Stat.ATTACK_POWER: 0.2})
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.ATTACK_POWER),
		180.0,
		0.001,
		"(100 + 50) * 1.2 — percentages apply after flats"
	)


func test_percent_modifiers_from_several_sources_add_together() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.MAX_HEALTH, 200.0)
	stats.add_modifier_source(&"a", {}, {GameEnums.Stat.MAX_HEALTH: 0.1})
	stats.add_modifier_source(&"b", {}, {GameEnums.Stat.MAX_HEALTH: 0.15})
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MAX_HEALTH),
		250.0,
		0.001,
		"percentages are additive, not multiplicative"
	)


func test_removing_a_source_removes_all_of_its_stats() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.ARMOR, 100.0)
	stats.add_modifier_source(
		&"shield",
		{GameEnums.Stat.ARMOR: 200.0},
		{GameEnums.Stat.MOVE_SPEED: -0.1}
	)
	assert_almost_eq(stats.get_stat(GameEnums.Stat.ARMOR), 300.0, 0.001, "armour applied")
	assert_true(stats.has_modifier_source(&"shield"), "source is registered")

	assert_true(stats.remove_modifier_source(&"shield"), "removal reports success")
	assert_almost_eq(stats.get_stat(GameEnums.Stat.ARMOR), 100.0, 0.001, "armour restored")
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MOVE_SPEED), 6.0, 0.001, "speed penalty removed too"
	)
	assert_false(stats.remove_modifier_source(&"shield"), "removing twice is a no-op")


func test_re_registering_a_source_replaces_it_rather_than_stacking() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.ATTACK_POWER, 100.0)
	stats.add_modifier_source(&"buff", {GameEnums.Stat.ATTACK_POWER: 20.0}, {})
	stats.add_modifier_source(&"buff", {GameEnums.Stat.ATTACK_POWER: 20.0}, {})
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.ATTACK_POWER),
		120.0,
		0.001,
		"a refreshed buff must not double-dip"
	)


func test_stats_are_clamped_to_sane_ranges() -> void:
	_install()
	stats.add_modifier_source(&"absurd", {
		GameEnums.Stat.CRIT_CHANCE: 5.0,
		GameEnums.Stat.COOLDOWN_REDUCTION: 5.0,
		GameEnums.Stat.LIFE_STEAL: 5.0,
	}, {})
	assert_almost_eq(stats.get_stat(GameEnums.Stat.CRIT_CHANCE), 1.0, 0.001, "crit caps at 100%")
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.COOLDOWN_REDUCTION), 0.75, 0.001, "CDR caps at 75%"
	)
	assert_almost_eq(stats.get_stat(GameEnums.Stat.LIFE_STEAL), 1.0, 0.001, "life steal caps")

	stats.add_modifier_source(&"crippling", {}, {GameEnums.Stat.MOVE_SPEED: -5.0})
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MOVE_SPEED), 0.0, 0.001, "speed never goes negative"
	)


func test_multiplier_stats_never_reach_zero() -> void:
	_install()
	stats.add_modifier_source(&"slow", {}, {GameEnums.Stat.ATTACK_SPEED: -10.0})
	assert_gt(
		stats.get_stat(GameEnums.Stat.ATTACK_SPEED),
		0.0,
		"attack speed is a divisor, so it must stay above zero"
	)


func test_armor_reduction_curve() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.ARMOR, 0.0)
	assert_almost_eq(stats.get_damage_reduction(), 0.0, 0.001, "no armour, no reduction")

	stats.set_base_stat(GameEnums.Stat.ARMOR, 400.0)
	assert_almost_eq(
		stats.get_damage_reduction(), 0.5, 0.001, "armour equal to K halves damage"
	)

	stats.set_base_stat(GameEnums.Stat.ARMOR, 1000000.0)
	assert_almost_eq(
		stats.get_damage_reduction(), 0.85, 0.001, "reduction is capped below immunity"
	)


func test_cooldown_reduction_applies_with_a_floor() -> void:
	_install()
	stats.add_modifier_source(&"gear", {GameEnums.Stat.COOLDOWN_REDUCTION: 0.25}, {})
	assert_almost_eq(stats.apply_cooldown_reduction(10.0), 7.5, 0.001, "25% off a 10s cooldown")
	assert_gt(stats.apply_cooldown_reduction(0.01), 0.0, "cooldowns never reach zero")


func test_resource_spending() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.MAX_RESOURCE, 100.0)
	stats.refill_resource()
	assert_almost_eq(stats.current_resource, 100.0, 0.001, "refilled")

	assert_true(stats.spend_resource(40.0), "spend within budget succeeds")
	assert_almost_eq(stats.current_resource, 60.0, 0.001, "deducted")

	assert_false(stats.spend_resource(90.0), "overspending fails")
	assert_almost_eq(stats.current_resource, 60.0, 0.001, "a failed spend deducts nothing")

	assert_true(stats.spend_resource(0.0), "a free ability always passes the check")


func test_resource_gain_is_clamped_to_maximum() -> void:
	_install()
	stats.set_base_stat(GameEnums.Stat.MAX_RESOURCE, 50.0)
	stats.current_resource = 0.0
	var gained := stats.gain_resource(80.0)
	assert_almost_eq(gained, 50.0, 0.001, "only the missing amount is reported as gained")
	assert_almost_eq(stats.current_resource, 50.0, 0.001, "pool is capped")
	assert_almost_eq(stats.get_resource_ratio(), 1.0, 0.001, "ratio reads full")


func test_rage_decays_only_after_leaving_combat() -> void:
	_install()
	stats.resource_kind = GameEnums.ResourceKind.RAGE
	stats.rage_decay_delay = 1.0
	stats.rage_decay_per_second = 10.0
	stats.set_base_stat(GameEnums.Stat.MAX_RESOURCE, 100.0)
	stats.current_resource = 50.0

	stats.notify_combat_activity()
	stats._process(0.5)
	assert_almost_eq(stats.current_resource, 50.0, 0.001, "rage holds while fighting")

	stats._process(1.0)
	stats._process(1.0)
	assert_lt(stats.current_resource, 50.0, "rage bleeds away out of combat")


func test_mana_regenerates_passively() -> void:
	_install()
	stats.resource_kind = GameEnums.ResourceKind.MANA
	stats.set_base_stat(GameEnums.Stat.MAX_RESOURCE, 100.0)
	stats.set_base_stat(GameEnums.Stat.RESOURCE_REGEN, 10.0)
	stats.current_resource = 0.0
	stats._process(1.0)
	assert_almost_eq(stats.current_resource, 10.0, 0.01, "one second of regen")
