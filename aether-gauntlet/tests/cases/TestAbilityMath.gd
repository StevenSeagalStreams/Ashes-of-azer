## Damage scaling, cooldown reduction, cast timing and projectile geometry.
extends TestCase

var stats: StatsComponent
var caster: Node3D


func get_suite_name() -> String:
	return "AbilityMath"


func before_each() -> void:
	caster = Node3D.new()
	caster.name = "Caster"
	own(caster)
	stats = StatsComponent.new()
	stats.name = "StatsComponent"
	caster.add_child(stats)


func _context(aim: Vector3 = Vector3(0.0, 0.0, -5.0)) -> AbilityContext:
	track(caster)
	return AbilityContext.create(caster, stats, GameEnums.Faction.PLAYER, aim)


func test_damage_equals_base_at_the_scaling_baseline() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_POWER: AbilityData.SCALING_BASELINE})
	var ability := AbilityData.new()
	ability.base_damage = 40.0
	ability.scaling_coefficient = 1.0
	assert_almost_eq(
		ability.compute_damage(_context()),
		40.0,
		0.001,
		"coefficient 1.0 at baseline attack power means exactly the base value"
	)


func test_damage_scales_linearly_with_the_scaling_stat() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_POWER: 30.0})
	var ability := AbilityData.new()
	ability.base_damage = 40.0
	ability.scaling_coefficient = 1.0
	assert_almost_eq(
		ability.compute_damage(_context()), 120.0, 0.001, "triple attack power, triple damage"
	)


func test_coefficient_weights_the_scaling() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_POWER: 20.0})
	var ability := AbilityData.new()
	ability.base_damage = 50.0
	ability.scaling_coefficient = 0.5
	assert_almost_eq(ability.compute_damage(_context()), 50.0, 0.001, "50 * 2.0 * 0.5")


func test_spell_power_abilities_ignore_attack_power() -> void:
	stats.set_base_stats({
		GameEnums.Stat.ATTACK_POWER: 100.0,
		GameEnums.Stat.SPELL_POWER: AbilityData.SCALING_BASELINE,
	})
	var ability := AbilityData.new()
	ability.base_damage = 30.0
	ability.scaling_stat = GameEnums.Stat.SPELL_POWER
	assert_almost_eq(
		ability.compute_damage(_context()),
		30.0,
		0.001,
		"a spell scales from spell power alone"
	)


func test_damage_multiplier_applies_on_top() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_POWER: AbilityData.SCALING_BASELINE})
	stats.add_modifier_source(&"buff", {}, {GameEnums.Stat.DAMAGE_MULT: 0.5})
	var ability := AbilityData.new()
	ability.base_damage = 100.0
	assert_almost_eq(
		ability.compute_damage(_context()), 150.0, 0.001, "+50% damage is a final multiplier"
	)


func test_cooldown_reduction_shortens_cooldowns() -> void:
	stats.set_base_stats({})
	stats.add_modifier_source(&"gear", {GameEnums.Stat.COOLDOWN_REDUCTION: 0.4}, {})
	var ability := AbilityData.new()
	ability.cooldown = 10.0
	assert_almost_eq(ability.compute_cooldown(_context()), 6.0, 0.001, "40% off")


func test_attack_speed_shortens_cast_duration() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_SPEED: 2.0})
	var ability := AbilityData.new()
	ability.windup = 0.2
	ability.active_time = 0.2
	ability.recovery = 0.2
	ability.scales_with_attack_speed = true
	assert_almost_eq(
		ability.compute_cast_duration(_context()), 0.3, 0.001, "double attack speed, half as long"
	)
	assert_almost_eq(ability.compute_windup(_context()), 0.1, 0.001, "wind-up shrinks too")


func test_abilities_can_opt_out_of_attack_speed_scaling() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_SPEED: 4.0})
	var ability := AbilityData.new()
	ability.windup = 0.5
	ability.active_time = 0.0
	ability.recovery = 0.0
	ability.scales_with_attack_speed = false
	assert_almost_eq(
		ability.compute_cast_duration(_context()),
		0.5,
		0.001,
		"an ultimate's timing is fixed by design"
	)


func test_area_size_scales_areas() -> void:
	stats.set_base_stats({})
	stats.add_modifier_source(&"gear", {}, {GameEnums.Stat.AREA_SIZE: 0.3})
	var ability := NovaAbility.new()
	assert_almost_eq(ability.compute_area_scale(_context()), 1.3, 0.001, "+30% area")


func test_tooltip_substitution() -> void:
	stats.set_base_stats({GameEnums.Stat.ATTACK_POWER: AbilityData.SCALING_BASELINE})
	var ability := AbilityData.new()
	ability.base_damage = 42.0
	ability.cooldown = 8.0
	ability.resource_cost = 30.0
	ability.description = "Hit for {damage} every {cooldown}s for {cost} rage."
	var text := ability.get_tooltip(_context())
	assert_true(text.contains("42"), "damage substituted")
	assert_true(text.contains("8.0"), "cooldown substituted")
	assert_true(text.contains("30"), "cost substituted")
	assert_false(text.contains("{"), "no placeholders left over")


func test_context_aim_direction_is_flattened_and_normalised() -> void:
	track(caster)
	caster.global_position = Vector3.ZERO
	var ctx := AbilityContext.create(
		caster, stats, GameEnums.Faction.PLAYER, Vector3(0.0, 99.0, -10.0)
	)
	assert_almost_eq(ctx.aim_direction.y, 0.0, 0.001, "aim ignores height")
	assert_almost_eq(ctx.aim_direction.length(), 1.0, 0.001, "normalised")
	assert_almost_eq(ctx.aim_direction.z, -1.0, 0.001, "points at the target")


func test_context_falls_back_to_facing_when_aiming_at_your_own_feet() -> void:
	track(caster)
	caster.global_position = Vector3(4.0, 0.0, 4.0)
	var ctx := AbilityContext.create(
		caster, stats, GameEnums.Faction.PLAYER, Vector3(4.0, 0.0, 4.0)
	)
	assert_almost_eq(
		ctx.aim_direction.length(), 1.0, 0.001, "a degenerate aim still yields a usable direction"
	)


func test_projectile_fan_is_centred_and_evenly_spread() -> void:
	var ability := ProjectileAbility.new()
	ability.projectile_count = 5
	ability.spread_degrees = 40.0

	var first := ability._fan_offset(0)
	var middle := ability._fan_offset(2)
	var last := ability._fan_offset(4)
	assert_almost_eq(rad_to_deg(first), -20.0, 0.001, "first arrow at one edge")
	assert_almost_eq(rad_to_deg(middle), 0.0, 0.001, "middle arrow flies straight")
	assert_almost_eq(rad_to_deg(last), 20.0, 0.001, "last arrow at the other edge")


func test_single_projectiles_have_no_fan_offset() -> void:
	var ability := ProjectileAbility.new()
	ability.projectile_count = 1
	ability.spread_degrees = 40.0
	assert_almost_eq(ability._fan_offset(0), 0.0, 0.001, "one shot always flies straight")


func test_ground_blast_clamps_its_target_to_max_range() -> void:
	track(caster)
	caster.global_position = Vector3.ZERO
	var ability := GroundBlastAbility.new()
	ability.max_cast_range = 10.0
	var ctx := AbilityContext.create(
		caster, stats, GameEnums.Faction.PLAYER, Vector3(0.0, 0.0, -50.0)
	)
	var target := ability._clamp_to_range(ctx)
	assert_almost_eq(
		caster.global_position.distance_to(target),
		10.0,
		0.01,
		"you cannot drop a meteor across the map"
	)


func test_ground_blast_leaves_in_range_targets_alone() -> void:
	track(caster)
	caster.global_position = Vector3.ZERO
	var ability := GroundBlastAbility.new()
	ability.max_cast_range = 20.0
	var ctx := AbilityContext.create(
		caster, stats, GameEnums.Faction.PLAYER, Vector3(0.0, 0.0, -6.0)
	)
	var target := ability._clamp_to_range(ctx)
	assert_almost_eq(target.z, -6.0, 0.01, "an in-range cast lands exactly where aimed")
