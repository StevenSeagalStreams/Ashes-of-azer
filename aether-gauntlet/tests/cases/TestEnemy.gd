## Enemy archetype scaling and the AI state machine.
extends TestCase

const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/Enemy.tscn")

var enemy: Enemy


func get_suite_name() -> String:
	return "Enemy"


func _add_floor() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "Floor"
	floor_body.collision_layer = CollisionLayers.WORLD
	floor_body.collision_mask = 0
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(80.0, 1.0, 80.0)
	shape.shape = box
	floor_body.add_child(shape)
	track(floor_body)
	floor_body.global_position = Vector3(0.0, -0.5, 0.0)


func _spawn_enemy(archetype_id: StringName, level: int, position: Vector3) -> Enemy:
	enemy = ENEMY_SCENE.instantiate() as Enemy
	enemy.configure(EnemyLibrary.get_enemy(archetype_id), level)
	track(enemy)
	enemy.global_position = position
	enemy.home_position = position
	return enemy


## A stand-in for the player: in the player group, damageable, with a hurtbox.
func _spawn_player_stub(position: Vector3) -> Dictionary:
	var body := Node3D.new()
	body.name = "PlayerStub"
	body.add_to_group(&"player")
	track(body)
	body.global_position = position

	var stats := StatsComponent.new()
	stats.name = "StatsComponent"
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 100000.0, GameEnums.Stat.ARMOR: 0.0})
	body.add_child(stats)

	var health := HealthComponent.new()
	health.name = "HealthComponent"
	health.stats = stats
	body.add_child(health)

	var hurtbox := HurtboxComponent.new()
	hurtbox.name = "HurtboxComponent"
	hurtbox.health = health
	hurtbox.faction = GameEnums.Faction.PLAYER
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.6
	shape.shape = sphere
	hurtbox.add_child(shape)
	body.add_child(hurtbox)

	return {"body": body, "health": health}


func test_library_defines_every_archetype() -> void:
	for id in [
		EnemyLibrary.GRUNT, EnemyLibrary.ARCHER, EnemyLibrary.BRUTE, EnemyLibrary.WARDEN
	]:
		var data := EnemyLibrary.get_enemy(id)
		assert_not_null(data, "archetype '%s' exists" % id)
		assert_not_null(data.attack_ability, "archetype '%s' can attack" % id)


func test_trash_archetypes_exclude_bosses() -> void:
	var trash := EnemyLibrary.get_trash_archetypes()
	assert_gt(float(trash.size()), 0.0, "there are trash mobs to spawn")
	for data in trash:
		assert_false(data.is_boss, "'%s' is not a boss" % data.id)


func test_stats_scale_geometrically_with_mob_level() -> void:
	var data := EnemyLibrary.get_enemy(EnemyLibrary.GRUNT)
	var level_1 := data.get_stats_for_level(1)
	var level_10 := data.get_stats_for_level(10)

	assert_almost_eq(
		float(level_1[GameEnums.Stat.MAX_HEALTH]),
		data.base_health,
		0.001,
		"level 1 is the authored base"
	)
	assert_gt(
		float(level_10[GameEnums.Stat.MAX_HEALTH]),
		float(level_1[GameEnums.Stat.MAX_HEALTH]) * 2.0,
		"ten levels more than doubles a mob's health"
	)
	assert_gt(
		float(level_10[GameEnums.Stat.ATTACK_POWER]),
		float(level_1[GameEnums.Stat.ATTACK_POWER]),
		"and its damage"
	)


func test_experience_scales_with_mob_level() -> void:
	var data := EnemyLibrary.get_enemy(EnemyLibrary.GRUNT)
	assert_eq(data.get_experience_for_level(1), data.base_experience, "base reward at level 1")
	assert_gt(
		float(data.get_experience_for_level(10)),
		float(data.base_experience),
		"higher mobs are worth more"
	)


func test_configure_applies_the_archetype() -> void:
	_add_floor()
	_spawn_enemy(EnemyLibrary.BRUTE, 3, Vector3.ZERO)
	await physics_frames(2)

	var expected := EnemyLibrary.get_enemy(EnemyLibrary.BRUTE).get_stats_for_level(3)
	assert_eq(enemy.data.id, EnemyLibrary.BRUTE, "archetype stored")
	assert_eq(enemy.mob_level, 3, "level stored")
	assert_almost_eq(
		enemy.health.get_max_health(),
		float(expected[GameEnums.Stat.MAX_HEALTH]),
		0.5,
		"health matches the scaled table"
	)
	assert_eq(
		enemy.abilities.get_ability(AbilityComponent.SLOT_PRIMARY),
		enemy.data.attack_ability,
		"attack loaded into the primary slot"
	)


func test_a_higher_level_enemy_is_strictly_tougher() -> void:
	_add_floor()
	var low := ENEMY_SCENE.instantiate() as Enemy
	low.configure(EnemyLibrary.get_enemy(EnemyLibrary.GRUNT), 1)
	track(low)
	var high := ENEMY_SCENE.instantiate() as Enemy
	high.configure(EnemyLibrary.get_enemy(EnemyLibrary.GRUNT), 12)
	track(high)
	await physics_frames(2)

	assert_gt(
		high.health.get_max_health(),
		low.health.get_max_health(),
		"the level delta the blue crystal sells is real"
	)


func test_enemies_start_idle_and_acquire_a_target() -> void:
	_add_floor()
	_spawn_player_stub(Vector3(0.0, 0.0, -5.0))
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(2)

	assert_not_null(enemy.acquire_target(), "the player is in aggro range")
	await physics_frames(30)
	assert_ne(
		enemy.state_machine.get_current_state_name(),
		&"Idle",
		"an enemy that can see the player does not stand still"
	)


func test_enemies_ignore_a_player_beyond_aggro_range() -> void:
	_add_floor()
	_spawn_player_stub(Vector3(0.0, 0.0, -200.0))
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(20)

	assert_null(enemy.acquire_target(), "out of range, out of mind")
	assert_eq(enemy.state_machine.get_current_state_name(), &"Idle", "still idle")


func test_enemies_close_the_distance() -> void:
	_add_floor()
	_spawn_player_stub(Vector3(0.0, 0.0, -12.0))
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(2)
	var start_distance := enemy.distance_to_target()

	await physics_frames(60)
	assert_lt(
		enemy.distance_to_target(), start_distance, "a melee grunt walks toward its target"
	)


func test_enemies_eventually_attack_and_damage_the_player() -> void:
	_add_floor()
	var stub := _spawn_player_stub(Vector3(0.0, 0.0, -3.0))
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(2)

	var health: HealthComponent = stub["health"]
	var before := health.current_health
	await physics_frames(180)
	assert_lt(health.current_health, before, "the grunt landed a hit within three seconds")


func test_melee_enemies_attack_a_target_standing_inside_them() -> void:
	# Character bodies no longer collide, so the player can walk right into a
	# mob. That spot must not be safe. An enemy that is *too close* is still in
	# range, and must never kite backwards out of its own attack window — the
	# player outruns every retreating melee archetype, so a retreat-only branch
	# hands them a permanent invulnerable standing position.
	for archetype in [EnemyLibrary.GRUNT, EnemyLibrary.BRUTE]:
		_add_floor()
		var stub := _spawn_player_stub(Vector3(0.0, 0.0, -0.4))
		_spawn_enemy(archetype, 1, Vector3.ZERO)
		await physics_frames(2)
		assert_not_null(enemy.acquire_target(), "'%s' sees the target" % archetype)

		var body: Node3D = stub["body"]
		var health: HealthComponent = stub["health"]
		var before := health.current_health

		# Pin the target on top of the enemy every frame. A stationary target
		# would let the enemy simply retreat to its preferred range and attack
		# from there; the exploit is a *player* who stays glued to the mob,
		# which they can, because they outrun the retreat.
		for i in 300:
			var offset := body.global_position - enemy.global_position
			offset.y = 0.0
			if offset.length_squared() < 0.0001:
				offset = Vector3(0.0, 0.0, -1.0)
			body.global_position = enemy.global_position + offset.normalized() * 0.4
			await physics_frames(1)

		assert_lt(
			health.current_health,
			before,
			"'%s' can hit a target standing on top of it" % archetype
		)
		cleanup()
		await physics_frames(2)


func test_ranged_enemies_still_open_the_gap_when_crowded() -> void:
	# The counterpart: prioritising the attack must not turn the archer into a
	# melee unit that plants itself in your face.
	_add_floor()
	_spawn_player_stub(Vector3.ZERO)
	_spawn_enemy(EnemyLibrary.ARCHER, 1, Vector3(0.0, 0.0, -1.5))
	await physics_frames(2)
	# Acquire explicitly: the idle scan is on a randomised interval, and
	# distance_to_target() reads INF until a target exists.
	assert_not_null(enemy.acquire_target(), "the archer sees the target")
	var start := enemy.distance_to_target()
	assert_lt(start, 2.0, "and starts crowded, well inside its preferred range")

	await physics_frames(300)
	assert_gt(
		enemy.distance_to_target(),
		start + 0.5,
		"a crowded archer still backs off toward its preferred range"
	)


func test_dying_moves_the_enemy_into_the_dead_state() -> void:
	_add_floor()
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(2)

	var seen: Dictionary = {"reward": -1}
	enemy.died.connect(func(_e: Enemy, experience: int) -> void: seen["reward"] = experience)
	enemy.health.kill()
	await physics_frames(2)

	assert_eq(enemy.state_machine.get_current_state_name(), &"Dead", "in the dead state")
	assert_eq(
		seen["reward"], enemy.get_experience_reward(), "the kill reports its experience value"
	)
	assert_false(
		enemy.is_in_group(&"enemies"), "a corpse leaves the group the wave counter reads"
	)


func test_bosses_resist_knockback_and_stagger() -> void:
	_add_floor()
	_spawn_enemy(EnemyLibrary.WARDEN, 1, Vector3.ZERO)
	await physics_frames(3)
	var start := enemy.global_position

	enemy.apply_knockback(Vector3(30.0, 0.0, 0.0))
	enemy.apply_stagger(1.0)
	await physics_frames(6)

	assert_lt(
		start.distance_to(enemy.global_position),
		0.5,
		"a boss is not shoved out of its own telegraph"
	)
	assert_ne(
		enemy.state_machine.get_current_state_name(),
		&"Stagger",
		"and cannot be stun-locked"
	)


func test_ordinary_enemies_do_stagger() -> void:
	_add_floor()
	_spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	await physics_frames(2)

	enemy.apply_stagger(0.4)
	assert_eq(
		enemy.state_machine.get_current_state_name(),
		&"Stagger",
		"trash reacts to a heavy blow"
	)


func test_enemy_attacks_cannot_hurt_other_enemies() -> void:
	_add_floor()
	var attacker := _spawn_enemy(EnemyLibrary.GRUNT, 1, Vector3.ZERO)
	var bystander := ENEMY_SCENE.instantiate() as Enemy
	bystander.configure(EnemyLibrary.get_enemy(EnemyLibrary.GRUNT), 1)
	track(bystander)
	bystander.global_position = Vector3(0.0, 0.0, -1.5)
	_spawn_player_stub(Vector3(0.0, 0.0, -2.5))
	await physics_frames(3)

	var before := bystander.health.current_health
	await physics_frames(180)
	assert_almost_eq(
		bystander.health.current_health,
		before,
		0.001,
		"friendly fire between mobs would make waves kill themselves"
	)
	assert_not_null(attacker, "attacker survived the test")
