## Buff and debuff application, stacking, expiry and damage over time.
extends TestCase

var stats: StatsComponent
var health: HealthComponent
var status: StatusEffectComponent


func get_suite_name() -> String:
	return "StatusEffects"


func before_each() -> void:
	stats = StatsComponent.new()
	stats.name = "StatsComponent"
	own(stats)
	health = HealthComponent.new()
	health.name = "HealthComponent"
	own(health)
	status = StatusEffectComponent.new()
	status.name = "StatusEffectComponent"
	own(status)


func _install(max_health: float = 1000.0) -> void:
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: max_health})
	track(stats)
	health.stats = stats
	track(health)
	status.stats = stats
	status.health = health
	track(status)


func test_library_defines_the_core_effects() -> void:
	for id in [
		StatusEffectLibrary.CHILL,
		StatusEffectLibrary.FREEZE,
		StatusEffectLibrary.BURN,
		StatusEffectLibrary.BLEED,
		StatusEffectLibrary.POISON,
		StatusEffectLibrary.SUNDER,
		StatusEffectLibrary.HASTE,
		StatusEffectLibrary.FORTIFY,
	]:
		assert_true(StatusEffectLibrary.has_effect(id), "library defines '%s'" % id)


func test_unknown_effects_are_rejected() -> void:
	_install()
	assert_false(status.apply(&"not_a_real_effect"), "unknown ids do not silently succeed")


func test_chill_slows_and_expires() -> void:
	_install()
	var base_speed := stats.get_stat(GameEnums.Stat.MOVE_SPEED)
	assert_true(status.apply(StatusEffectLibrary.CHILL), "chill applied")
	assert_lt(
		stats.get_stat(GameEnums.Stat.MOVE_SPEED), base_speed, "chilled targets move slower"
	)

	status._process(10.0)
	assert_false(status.has_effect(StatusEffectLibrary.CHILL), "chill wore off")
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MOVE_SPEED),
		base_speed,
		0.001,
		"the slow is fully undone when the effect ends"
	)


func test_stacks_are_capped_and_scale_the_modifier() -> void:
	_install()
	status.apply(StatusEffectLibrary.POISON)
	var one_stack := stats.get_stat(GameEnums.Stat.DAMAGE_MULT)
	status.apply(StatusEffectLibrary.POISON)
	assert_lt(stats.get_stat(GameEnums.Stat.DAMAGE_MULT), one_stack, "a second stack hurts more")

	for i in 10:
		status.apply(StatusEffectLibrary.POISON)
	var data := StatusEffectLibrary.get_effect(StatusEffectLibrary.POISON)
	assert_eq(
		status.get_stacks(StatusEffectLibrary.POISON),
		data.max_stacks,
		"stacks stop at the definition's cap"
	)


func test_reapplying_refreshes_the_duration() -> void:
	_install()
	status.apply(StatusEffectLibrary.CHILL)
	status._process(2.0)
	var partly_elapsed := status.get_time_left(StatusEffectLibrary.CHILL)
	status.apply(StatusEffectLibrary.CHILL)
	assert_gt(
		status.get_time_left(StatusEffectLibrary.CHILL),
		partly_elapsed,
		"a fresh application resets the clock"
	)


func test_damage_over_time_ticks() -> void:
	_install(1000.0)
	status.tick_period = 0.5
	status.apply(StatusEffectLibrary.BURN)
	var before := health.current_health

	status._process(0.4)
	assert_almost_eq(health.current_health, before, 0.001, "nothing happens before a full tick")

	status._process(0.2)
	assert_lt(health.current_health, before, "the first tick lands")


func test_damage_over_time_scales_with_stacks() -> void:
	_install(5000.0)
	status.tick_period = 0.5

	status.apply(StatusEffectLibrary.BLEED)
	var start_single := health.current_health
	status._process(0.5)
	var single_tick := start_single - health.current_health

	status.remove_effect(StatusEffectLibrary.BLEED)
	status.apply(StatusEffectLibrary.BLEED, null, 3)
	var start_triple := health.current_health
	status._process(0.5)
	var triple_tick := start_triple - health.current_health

	assert_almost_eq(triple_tick, single_tick * 3.0, 0.01, "three stacks tick three times as hard")


func test_freeze_reports_incapacitation() -> void:
	_install()
	assert_false(status.is_incapacitated(), "not incapacitated by default")
	status.apply(StatusEffectLibrary.FREEZE)
	assert_true(status.is_incapacitated(), "frozen targets cannot act")
	status.remove_effect(StatusEffectLibrary.FREEZE)
	assert_false(status.is_incapacitated(), "control returns when it ends")


func test_cleanse_removes_debuffs_but_keeps_buffs() -> void:
	_install()
	status.apply(StatusEffectLibrary.CHILL)
	status.apply(StatusEffectLibrary.POISON)
	status.apply(StatusEffectLibrary.HASTE)

	assert_eq(status.cleanse_debuffs(), 2, "two debuffs removed")
	assert_false(status.has_effect(StatusEffectLibrary.CHILL), "chill gone")
	assert_false(status.has_effect(StatusEffectLibrary.POISON), "poison gone")
	assert_true(status.has_effect(StatusEffectLibrary.HASTE), "the buff survives a cleanse")


func test_clear_all_removes_every_modifier() -> void:
	_install()
	var base_speed := stats.get_stat(GameEnums.Stat.MOVE_SPEED)
	status.apply(StatusEffectLibrary.CHILL)
	status.apply(StatusEffectLibrary.HASTE)
	status.clear_all()
	assert_true(status.get_active_ids().is_empty(), "nothing left active")
	assert_almost_eq(
		stats.get_stat(GameEnums.Stat.MOVE_SPEED), base_speed, 0.001, "stats fully restored"
	)


func test_effects_are_not_applied_to_the_dead() -> void:
	_install()
	health.kill()
	assert_false(status.apply(StatusEffectLibrary.BURN), "corpses do not catch fire")


func test_apply_many_handles_a_hitbox_payload() -> void:
	_install()
	var payload: Array[StringName] = [StatusEffectLibrary.CHILL, StatusEffectLibrary.BLEED]
	status.apply_many(payload)
	assert_true(status.has_effect(StatusEffectLibrary.CHILL), "first effect applied")
	assert_true(status.has_effect(StatusEffectLibrary.BLEED), "second effect applied")
