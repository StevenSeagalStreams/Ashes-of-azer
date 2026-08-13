## Cast validation, the wind-up/effect/recovery timeline, cooldowns, buffering.
extends TestCase

## Records every execution instead of spawning anything, so the timeline can be
## asserted without touching the physics server.
class SpyAbility:
	extends AbilityData

	var executions: int = 0
	var last_aim: Vector3 = Vector3.ZERO

	func execute(ctx: AbilityContext) -> void:
		executions += 1
		last_aim = ctx.aim_point


var caster: Node3D
var stats: StatsComponent
var status: StatusEffectComponent
var abilities: AbilityComponent
var spy: SpyAbility


func get_suite_name() -> String:
	return "AbilityComponent"


func before_each() -> void:
	caster = Node3D.new()
	caster.name = "Caster"
	own(caster)

	stats = StatsComponent.new()
	stats.name = "StatsComponent"
	stats.set_base_stats({
		GameEnums.Stat.MAX_RESOURCE: 100.0,
		GameEnums.Stat.RESOURCE_REGEN: 0.0,
		GameEnums.Stat.ATTACK_SPEED: 1.0,
	})
	caster.add_child(stats)

	status = StatusEffectComponent.new()
	status.name = "StatusEffectComponent"
	status.stats = stats
	caster.add_child(status)

	abilities = AbilityComponent.new()
	abilities.name = "AbilityComponent"
	abilities.stats = stats
	abilities.status = status
	abilities.faction = GameEnums.Faction.PLAYER
	caster.add_child(abilities)

	spy = SpyAbility.new()
	spy.id = &"spy"
	spy.cooldown = 2.0
	spy.windup = 0.2
	spy.active_time = 0.1
	spy.recovery = 0.2
	spy.resource_cost = 0.0
	spy.scales_with_attack_speed = false


func _install() -> void:
	track(caster)
	abilities.setup(caster)
	abilities.set_ability(AbilityComponent.SLOT_PRIMARY, spy)
	stats.refill_resource()


func test_casting_an_empty_slot_fails_cleanly() -> void:
	_install()
	var reasons: Array[StringName] = []
	abilities.cast_failed.connect(
		func(_slot: StringName, reason: StringName) -> void: reasons.append(reason)
	)
	assert_false(
		abilities.try_cast(AbilityComponent.SLOT_SECONDARY, Vector3.ZERO), "no ability, no cast"
	)
	assert_true(reasons.has(&"empty"), "failure reason is reported")


func test_a_cast_runs_windup_then_effect_then_recovery() -> void:
	_install()
	assert_true(abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3(1, 0, 1)), "cast began")
	assert_true(abilities.is_casting(), "busy during the wind-up")
	assert_eq(spy.executions, 0, "the effect has not fired yet")

	abilities._process(0.1)
	assert_eq(spy.executions, 0, "still winding up")

	abilities._process(0.15)
	assert_eq(spy.executions, 1, "the effect fires when the wind-up elapses")
	assert_true(abilities.is_casting(), "recovery still locks the caster")

	abilities._process(0.5)
	assert_false(abilities.is_casting(), "free once recovery ends")
	assert_eq(spy.executions, 1, "the effect fired exactly once")


func test_zero_windup_abilities_fire_immediately() -> void:
	spy.windup = 0.0
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_eq(spy.executions, 1, "an instant ability connects on the frame it is pressed")


func test_the_aim_point_reaches_the_ability() -> void:
	spy.windup = 0.0
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3(3.0, 0.0, -4.0))
	assert_almost_eq(spy.last_aim.x, 3.0, 0.001, "aim x forwarded")
	assert_almost_eq(spy.last_aim.z, -4.0, 0.001, "aim z forwarded")


func test_cooldowns_gate_repeat_casts() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	abilities._process(1.0)
	assert_false(abilities.is_casting(), "the first cast finished")
	assert_true(abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY), "still cooling down")
	assert_false(
		abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO, false),
		"cannot recast during the cooldown"
	)

	abilities._process(2.0)
	assert_false(abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY), "cooldown elapsed")
	assert_true(
		abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO), "usable again"
	)


func test_cooldown_ratio_sweeps_from_zero_to_one() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_almost_eq(
		abilities.get_cooldown_ratio(AbilityComponent.SLOT_PRIMARY),
		0.0,
		0.05,
		"the sweep starts empty"
	)
	abilities._process(1.0)
	assert_almost_eq(
		abilities.get_cooldown_ratio(AbilityComponent.SLOT_PRIMARY),
		0.5,
		0.05,
		"half elapsed, half full"
	)
	abilities._process(1.5)
	assert_almost_eq(
		abilities.get_cooldown_ratio(AbilityComponent.SLOT_PRIMARY),
		1.0,
		0.001,
		"ready reads as full"
	)


func test_insufficient_resource_blocks_the_cast_and_spends_nothing() -> void:
	spy.resource_cost = 80.0
	_install()
	stats.current_resource = 20.0
	var reasons: Array[StringName] = []
	abilities.cast_failed.connect(
		func(_slot: StringName, reason: StringName) -> void: reasons.append(reason)
	)
	assert_false(
		abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO), "cannot afford it"
	)
	assert_true(reasons.has(&"resource"), "reason reported")
	assert_almost_eq(stats.current_resource, 20.0, 0.001, "nothing was deducted")
	assert_false(
		abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY),
		"a refused cast must not burn the cooldown"
	)


func test_a_successful_cast_spends_its_cost() -> void:
	spy.resource_cost = 35.0
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_almost_eq(stats.current_resource, 65.0, 0.001, "cost deducted once")


func test_generators_grant_resource_on_cast() -> void:
	spy.resource_cost = 0.0
	spy.resource_gain = 15.0
	_install()
	stats.current_resource = 0.0
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_almost_eq(stats.current_resource, 15.0, 0.001, "the generator paid out")


func test_casting_while_busy_is_refused() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_false(
		abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO, false),
		"one cast at a time"
	)


func test_a_buffered_input_fires_when_the_current_cast_ends() -> void:
	spy.cooldown = 0.0
	_install()
	var step := 1.0 / 60.0
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)

	# Run most of the 0.5s cast at a real frame rate.
	for i in 25:
		abilities._process(step)
	assert_eq(spy.executions, 1, "the first cast's effect has fired")
	assert_true(abilities.is_casting(), "but recovery is still running")

	# Pressed slightly early, inside the buffer window rather than dropped.
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO, true)

	# Past the end of the first cast, then past the follow-up's own wind-up.
	for i in 20:
		abilities._process(step)
	assert_eq(spy.executions, 2, "the buffered press chained into the follow-up")


func test_a_stale_buffered_input_is_discarded() -> void:
	spy.cooldown = 0.0
	abilities.input_buffer_time = 0.1
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO, true)
	abilities._process(1.0)
	var executions_after_first := spy.executions
	abilities._process(0.1)
	assert_eq(
		spy.executions,
		executions_after_first,
		"an input buffered a second ago must not fire out of nowhere"
	)


func test_cancelling_before_the_effect_refunds_the_cost() -> void:
	spy.resource_cost = 40.0
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_almost_eq(stats.current_resource, 60.0, 0.001, "cost paid")
	abilities.cancel_cast(true)
	assert_almost_eq(stats.current_resource, 100.0, 0.001, "an interrupted wind-up is refunded")
	assert_eq(spy.executions, 0, "and nothing was cast")


func test_cancelling_after_the_effect_does_not_refund() -> void:
	spy.resource_cost = 40.0
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	abilities._process(0.25)
	assert_eq(spy.executions, 1, "the effect landed")
	abilities.cancel_cast(true)
	assert_almost_eq(
		stats.current_resource, 60.0, 0.001, "you do not get the cost back once it hit"
	)


func test_incapacitated_casters_cannot_act() -> void:
	_install()
	status.apply(StatusEffectLibrary.FREEZE)
	var reasons: Array[StringName] = []
	abilities.cast_failed.connect(
		func(_slot: StringName, reason: StringName) -> void: reasons.append(reason)
	)
	assert_false(
		abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO), "frozen casters are locked"
	)
	assert_true(reasons.has(&"incapacitated"), "reason reported")


func test_becoming_incapacitated_mid_cast_cancels_it() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	status.apply(StatusEffectLibrary.FREEZE)
	abilities._process(0.05)
	assert_false(abilities.is_casting(), "the cast was interrupted")
	assert_eq(spy.executions, 0, "and never fired")


func test_reset_cooldowns_clears_everything() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	assert_true(abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY), "on cooldown")
	abilities.reset_cooldowns()
	assert_false(abilities.is_on_cooldown(AbilityComponent.SLOT_PRIMARY), "cleared")


func test_reduce_cooldowns_shaves_time_off() -> void:
	_install()
	abilities.try_cast(AbilityComponent.SLOT_PRIMARY, Vector3.ZERO)
	var before := abilities.get_cooldown_remaining(AbilityComponent.SLOT_PRIMARY)
	abilities.reduce_cooldowns(0.5)
	assert_almost_eq(
		abilities.get_cooldown_remaining(AbilityComponent.SLOT_PRIMARY),
		before - 0.5,
		0.001,
		"cooldown-reset effects shave real seconds"
	)


func test_set_kit_populates_all_three_slots() -> void:
	_install()
	var secondary := SpyAbility.new()
	var special := SpyAbility.new()
	abilities.set_kit(spy, secondary, special)
	assert_eq(abilities.get_ability(AbilityComponent.SLOT_PRIMARY), spy, "primary set")
	assert_eq(abilities.get_ability(AbilityComponent.SLOT_SECONDARY), secondary, "secondary set")
	assert_eq(abilities.get_ability(AbilityComponent.SLOT_SPECIAL), special, "special set")
	assert_eq(abilities.get_slots().size(), 3, "three populated slots")


func test_clearing_a_slot_removes_the_ability() -> void:
	_install()
	abilities.set_ability(AbilityComponent.SLOT_PRIMARY, null)
	assert_null(abilities.get_ability(AbilityComponent.SLOT_PRIMARY), "slot emptied")
