## Hitbox and hurtbox behaviour against the live physics server.
##
## These tests need real physics frames: an Area3D is only visible to a shape
## query once the physics server has synced it, so every scenario builds the
## volumes, waits a tick, then scans.
extends TestCase

var hitbox: HitboxComponent
var hitbox_shape: CollisionShape3D


func get_suite_name() -> String:
	return "CombatVolumes"


func before_each() -> void:
	hitbox = HitboxComponent.new()
	hitbox.name = "Hitbox"
	own(hitbox)
	hitbox_shape = CollisionShape3D.new()
	var cylinder := CylinderShape3D.new()
	cylinder.radius = 3.0
	cylinder.height = 3.0
	hitbox_shape.shape = cylinder
	hitbox.add_child(hitbox_shape)
	hitbox.damage = 25.0
	hitbox.faction = GameEnums.Faction.PLAYER


## Build a damageable target at [param position] belonging to [param faction].
func _make_target(
	position: Vector3, faction: GameEnums.Faction = GameEnums.Faction.ENEMY
) -> Dictionary:
	var body := Node3D.new()
	body.name = "Target"
	track(body)
	body.global_position = position

	var stats := StatsComponent.new()
	stats.name = "StatsComponent"
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 1000.0, GameEnums.Stat.ARMOR: 0.0})
	body.add_child(stats)

	var health := HealthComponent.new()
	health.name = "HealthComponent"
	health.stats = stats
	body.add_child(health)

	var hurtbox := HurtboxComponent.new()
	hurtbox.name = "HurtboxComponent"
	hurtbox.health = health
	hurtbox.faction = faction
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.5
	shape.shape = sphere
	hurtbox.add_child(shape)
	body.add_child(hurtbox)

	return {"body": body, "health": health, "hurtbox": hurtbox, "stats": stats}


func _install_hitbox(position: Vector3 = Vector3.ZERO) -> void:
	track(hitbox)
	hitbox.global_position = position


func test_hitbox_damages_an_opposing_hurtbox() -> void:
	var target := _make_target(Vector3(1.5, 0.0, 0.0))
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	var health: HealthComponent = target["health"]
	assert_lt(health.current_health, 1000.0, "an enemy inside the volume takes damage")
	assert_almost_eq(
		1000.0 - health.current_health, 25.0, 0.001, "damage matches the hitbox's value"
	)


func test_hitbox_ignores_its_own_faction() -> void:
	var target := _make_target(Vector3(1.5, 0.0, 0.0), GameEnums.Faction.PLAYER)
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	var health: HealthComponent = target["health"]
	assert_almost_eq(health.current_health, 1000.0, 0.001, "no friendly fire")


func test_targets_already_inside_are_hit_on_activation() -> void:
	# The whole reason hitboxes use shape queries instead of area_entered.
	var target := _make_target(Vector3.ZERO)
	_install_hitbox(Vector3.ZERO)
	await physics_frames(2)

	# Lambdas capture by value in GDScript, so the tally lives in a Dictionary.
	var seen: Dictionary = {"landed": 0}
	hitbox.hit_landed.connect(
		func(_hurtbox: HurtboxComponent, _dealt: float, _info: DamageInfo) -> void:
			seen["landed"] += 1
	)
	hitbox.activate(0.0)
	assert_eq(seen["landed"], 1, "a target standing in the volume is hit the moment it goes live")


func test_a_target_is_only_hit_once_per_swing() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	_install_hitbox()
	await physics_frames(2)

	hitbox.tick_interval = 0.0
	hitbox.activate(0.0)
	var after_first: float = (target["health"] as HealthComponent).current_health
	hitbox.scan()
	hitbox.scan()
	assert_almost_eq(
		(target["health"] as HealthComponent).current_health,
		after_first,
		0.001,
		"one swing, one hit"
	)


func test_ticking_hitboxes_rehit_after_their_interval() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	_install_hitbox()
	await physics_frames(2)

	hitbox.tick_interval = 0.25
	hitbox.activate(0.0)
	var health: HealthComponent = target["health"]
	var after_first := health.current_health
	assert_lt(after_first, 1000.0, "first tick landed")

	# Drive the internal clock past the tick interval.
	hitbox._physics_process(0.3)
	assert_lt(health.current_health, after_first, "a channel re-hits once the interval elapses")


func test_deactivated_hitboxes_deal_no_damage() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	hitbox.deactivate()
	var health: HealthComponent = target["health"]
	var before := health.current_health
	assert_eq(hitbox.scan(), 0, "a dormant hitbox scans nothing")
	assert_almost_eq(health.current_health, before, 0.001, "and deals nothing")


func test_arc_filter_excludes_targets_behind_the_swing() -> void:
	# The hitbox faces -Z by convention, so +Z is directly behind it.
	var in_front := _make_target(Vector3(0.0, 0.0, -2.0))
	var behind := _make_target(Vector3(0.0, 0.0, 2.0))
	_install_hitbox()
	hitbox.arc_degrees = 90.0
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_lt(
		(in_front["health"] as HealthComponent).current_health,
		1000.0,
		"the target in the cone is hit"
	)
	assert_almost_eq(
		(behind["health"] as HealthComponent).current_health,
		1000.0,
		0.001,
		"the target behind the swing is spared"
	)


func test_the_arc_is_measured_from_the_swinger_not_the_volume() -> void:
	# A melee swing's volume sits ahead of whoever swung it. If the cone is
	# measured from the volume's own centre, everything closer than that offset
	# reads as ~180° behind it and is filtered out, leaving a dead zone right
	# in front of the attacker.
	var swinger := Node3D.new()
	swinger.name = "Swinger"
	track(swinger)
	swinger.global_position = Vector3.ZERO

	# Target between the swinger and the volume's centre — point-blank.
	var target := _make_target(Vector3(0.0, 0.0, -0.4))
	_install_hitbox(Vector3(0.0, 0.0, -1.0))
	hitbox.arc_degrees = 120.0
	hitbox.arc_origin_node = swinger
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_lt(
		(target["health"] as HealthComponent).current_health,
		1000.0,
		"a point-blank target is inside the swing, not behind it"
	)


func test_the_arc_still_excludes_targets_behind_the_swinger() -> void:
	var swinger := Node3D.new()
	swinger.name = "Swinger"
	track(swinger)
	swinger.global_position = Vector3.ZERO

	var behind := _make_target(Vector3(0.0, 0.0, 2.0))
	_install_hitbox(Vector3(0.0, 0.0, -1.0))
	hitbox.arc_degrees = 120.0
	hitbox.arc_origin_node = swinger
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_almost_eq(
		(behind["health"] as HealthComponent).current_health,
		1000.0,
		0.001,
		"anchoring the cone at the swinger must not make it hit backwards"
	)


func test_full_circle_hitboxes_hit_everything_around_them() -> void:
	var north := _make_target(Vector3(0.0, 0.0, -2.0))
	var south := _make_target(Vector3(0.0, 0.0, 2.0))
	_install_hitbox()
	hitbox.arc_degrees = 360.0
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_lt((north["health"] as HealthComponent).current_health, 1000.0, "front hit")
	assert_lt((south["health"] as HealthComponent).current_health, 1000.0, "back hit too")


func test_targets_outside_the_radius_are_untouched() -> void:
	var far_away := _make_target(Vector3(20.0, 0.0, 0.0))
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_almost_eq(
		(far_away["health"] as HealthComponent).current_health,
		1000.0,
		0.001,
		"range is respected"
	)


func test_hit_landed_reports_the_damage_that_actually_landed() -> void:
	# The floating combat number is drawn from this packet, so if it carries
	# the pre-mitigation figure the player is told a number the game did not
	# apply — armour, Sunder and weak points all become invisible.
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	var stats: StatsComponent = target["stats"]
	stats.set_base_stat(GameEnums.Stat.ARMOR, 400.0)
	_install_hitbox()
	await physics_frames(2)

	var seen: Dictionary = {}
	hitbox.hit_landed.connect(
		func(_hurtbox: HurtboxComponent, dealt: float, info: DamageInfo) -> void:
			seen["dealt"] = dealt
			seen["applied"] = info.applied_amount
	)
	hitbox.activate(0.0)

	assert_almost_eq(float(seen.get("dealt", 0.0)), 12.5, 0.001, "400 armour halves a 25 hit")
	assert_almost_eq(
		float(seen.get("applied", 0.0)),
		float(seen.get("dealt", 0.0)),
		0.001,
		"the reported packet agrees with the damage the health component applied"
	)


func test_hit_landed_reflects_a_weak_point_multiplier() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	(target["hurtbox"] as HurtboxComponent).damage_multiplier = 3.0
	_install_hitbox()
	await physics_frames(2)

	var seen: Dictionary = {}
	hitbox.hit_landed.connect(
		func(_hurtbox: HurtboxComponent, _dealt: float, info: DamageInfo) -> void:
			seen["applied"] = info.applied_amount
	)
	hitbox.activate(0.0)

	assert_almost_eq(
		float(seen.get("applied", 0.0)),
		75.0,
		0.001,
		"a weak point hit reports the tripled damage, not the base swing"
	)


func test_critical_hits_multiply_damage() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	_install_hitbox()
	hitbox.crit_chance = 1.0
	hitbox.crit_damage = 2.0
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_almost_eq(
		1000.0 - (target["health"] as HealthComponent).current_health,
		50.0,
		0.001,
		"a guaranteed crit doubles a 25 damage hit"
	)


func test_hurtbox_damage_multiplier_creates_weak_points() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	(target["hurtbox"] as HurtboxComponent).damage_multiplier = 3.0
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_almost_eq(
		1000.0 - (target["health"] as HealthComponent).current_health,
		75.0,
		0.001,
		"a weak point triples the blow"
	)


func test_invulnerable_targets_take_nothing() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	var health: HealthComponent = target["health"]
	health.add_invulnerability()
	_install_hitbox()
	await physics_frames(2)

	hitbox.activate(0.0)
	assert_almost_eq(
		health.current_health, 1000.0, 0.001, "dodge i-frames survive a direct overlap"
	)


func test_disabled_hurtboxes_reject_hits() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	var hurtbox: HurtboxComponent = target["hurtbox"]
	hurtbox.set_enabled(false)
	_install_hitbox()
	await physics_frames(2)

	var info := DamageInfo.new(50.0, GameEnums.DamageType.PHYSICAL, GameEnums.Faction.PLAYER)
	assert_almost_eq(hurtbox.receive_hit(info), 0.0, 0.001, "a disabled hurtbox takes nothing")


func test_dead_targets_reject_hits() -> void:
	var target := _make_target(Vector3(1.0, 0.0, 0.0))
	_install_hitbox()
	var health: HealthComponent = target["health"]
	var hurtbox: HurtboxComponent = target["hurtbox"]
	health.kill()
	var info := DamageInfo.new(50.0, GameEnums.DamageType.PHYSICAL, GameEnums.Faction.PLAYER)
	assert_almost_eq(hurtbox.receive_hit(info), 0.0, 0.001, "corpses are not re-damaged")


func test_area_scale_grows_the_shape() -> void:
	_install_hitbox()
	var before := hitbox.get_effective_radius()
	hitbox.apply_area_scale(2.0)
	assert_almost_eq(
		hitbox.get_effective_radius(), before * 2.0, 0.001, "AREA_SIZE doubles the radius"
	)


func test_area_scale_does_not_leak_between_instances() -> void:
	_install_hitbox()
	var other := HitboxComponent.new()
	other.name = "OtherHitbox"
	var other_shape := CollisionShape3D.new()
	other_shape.shape = hitbox_shape.shape
	other.add_child(other_shape)
	track(other)

	hitbox.apply_area_scale(3.0)
	assert_almost_eq(
		other.get_effective_radius(),
		3.0,
		0.001,
		"scaling one hitbox must not resize a shape shared with another"
	)


func test_max_targets_caps_a_single_scan() -> void:
	for i in 8:
		_make_target(Vector3(cos(float(i)) * 1.2, 0.0, sin(float(i)) * 1.2))
	_install_hitbox()
	hitbox.max_targets = 3
	hitbox.arc_degrees = 360.0
	await physics_frames(2)

	var seen: Dictionary = {"landed": 0}
	hitbox.hit_landed.connect(
		func(_hurtbox: HurtboxComponent, _dealt: float, _info: DamageInfo) -> void:
			seen["landed"] += 1
	)
	hitbox.activate(0.0)
	assert_between(
		float(seen["landed"]),
		1.0,
		3.0,
		"the frame budget guard limits how many targets one scan resolves"
	)
