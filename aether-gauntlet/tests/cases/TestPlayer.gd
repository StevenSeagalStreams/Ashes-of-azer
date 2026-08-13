## End-to-end player behaviour against the real Player scene.
extends TestCase

const PLAYER_SCENE: PackedScene = preload("res://scenes/player/Player.tscn")

var player: Player


func get_suite_name() -> String:
	return "Player"


func before_each() -> void:
	GameState.reset_profile(GameEnums.ClassId.WARRIOR)
	GameState.refill_potions()


func after_each() -> void:
	GameState.reset_profile(GameEnums.ClassId.WARRIOR)


## Build a floor so the character controller has something to stand on.
func _add_floor() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "Floor"
	floor_body.collision_layer = CollisionLayers.WORLD
	floor_body.collision_mask = 0
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(60.0, 1.0, 60.0)
	shape.shape = box
	floor_body.add_child(shape)
	track(floor_body)
	floor_body.global_position = Vector3(0.0, -0.5, 0.0)


func _spawn_player(class_id: GameEnums.ClassId = GameEnums.ClassId.WARRIOR) -> Player:
	GameState.select_class(class_id)
	player = PLAYER_SCENE.instantiate() as Player
	track(player)
	player.global_position = Vector3.ZERO
	return player


## A damageable dummy standing [param distance] metres in front of the player.
func _spawn_dummy(distance: float = 2.0) -> Dictionary:
	var body := Node3D.new()
	body.name = "Dummy"
	track(body)
	body.global_position = Vector3(0.0, 0.0, -distance)

	var stats := StatsComponent.new()
	stats.name = "StatsComponent"
	stats.set_base_stats({GameEnums.Stat.MAX_HEALTH: 100000.0, GameEnums.Stat.ARMOR: 0.0})
	body.add_child(stats)

	var health := HealthComponent.new()
	health.name = "HealthComponent"
	health.stats = stats
	body.add_child(health)

	var status := StatusEffectComponent.new()
	status.name = "StatusEffectComponent"
	status.stats = stats
	status.health = health
	body.add_child(status)

	var hurtbox := HurtboxComponent.new()
	hurtbox.name = "HurtboxComponent"
	hurtbox.health = health
	hurtbox.faction = GameEnums.Faction.ENEMY
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.6
	shape.shape = sphere
	hurtbox.add_child(shape)
	body.add_child(hurtbox)

	return {"body": body, "health": health, "status": status, "stats": stats}


func test_player_boots_with_a_class_applied() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	assert_not_null(player.class_data, "class data applied")
	assert_eq(player.class_data.class_id, GameEnums.ClassId.WARRIOR, "the selected class")
	assert_eq(
		player.stats.resource_kind, GameEnums.ResourceKind.RAGE, "resource pool matches the class"
	)
	assert_almost_eq(
		player.health.get_max_health(),
		float(player.class_data.base_stats[GameEnums.Stat.MAX_HEALTH]),
		0.001,
		"health comes from the class"
	)
	assert_eq(player.state_machine.get_current_state_name(), &"Idle", "starts idle")


func test_every_class_can_be_applied_to_the_same_player_node() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	for class_id in [
		GameEnums.ClassId.WIZARD, GameEnums.ClassId.RANGER, GameEnums.ClassId.WARRIOR
	]:
		var data := ClassLibrary.get_archetype(class_id)
		player.apply_class(data, 1)
		assert_eq(player.class_data.class_id, class_id, "%s applied" % data.display_name)
		assert_eq(
			player.abilities.get_ability(AbilityComponent.SLOT_PRIMARY),
			data.primary_ability,
			"%s kit loaded" % data.display_name
		)
		assert_eq(
			player.stats.resource_kind, data.resource_kind, "%s pool set" % data.display_name
		)


func test_rage_classes_start_empty_and_mana_classes_start_full() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)
	assert_almost_eq(player.stats.current_resource, 0.0, 0.001, "rage is earned, not given")

	player.apply_class(ClassLibrary.get_archetype(GameEnums.ClassId.WIZARD), 1)
	assert_almost_eq(
		player.stats.current_resource,
		player.stats.get_stat(GameEnums.Stat.MAX_RESOURCE),
		0.001,
		"a wizard opens with a full mana bar"
	)


func test_dodge_grants_invulnerability_then_gives_it_back() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.RANGER)
	await physics_frames(2)

	assert_true(player.can_dodge(), "dodge is available")
	assert_true(player.try_dodge(), "dodge started")
	assert_eq(player.state_machine.get_current_state_name(), &"Dodge", "entered the dodge state")
	assert_true(player.health.is_invulnerable(), "i-frames are live at the start of the roll")

	# Run past the i-frame window but stay inside the roll.
	var iframes := player.class_data.dodge_iframe_time
	await physics_frames(int(ceil(iframes / 0.0166)) + 4)
	assert_false(
		player.health.is_invulnerable(),
		"i-frames end before the roll does, so a late dodge still eats the hit"
	)


func test_dodge_ends_and_returns_control() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.RANGER)
	await physics_frames(2)

	player.try_dodge()
	await physics_frames(int(ceil(player.class_data.dodge_duration / 0.0166)) + 6)
	assert_ne(
		player.state_machine.get_current_state_name(), &"Dodge", "the roll finished"
	)
	assert_false(player.health.is_invulnerable(), "no lingering immunity")


func test_dodge_respects_its_cooldown() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	player.try_dodge()
	assert_false(player.can_dodge(), "cannot dodge twice in a row")
	assert_gt(player.get_dodge_cooldown_remaining(), 0.0, "cooldown is running")
	assert_false(player.try_dodge(), "a second attempt is refused")


func test_dodge_moves_the_player() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.RANGER)
	await physics_frames(2)
	var start := player.global_position

	player.try_dodge()
	await physics_frames(int(ceil(player.class_data.dodge_duration / 0.0166)) + 4)
	assert_gt(
		start.distance_to(player.global_position),
		1.0,
		"the roll actually covers ground"
	)


func test_potion_heals_and_consumes_a_charge() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	var charges_before := GameState.potion_charges
	player.health.apply_damage(
		DamageInfo.new(100.0, GameEnums.DamageType.TRUE, GameEnums.Faction.ENEMY)
	)
	var wounded := player.health.current_health

	assert_true(player.try_use_potion(), "potion drunk")
	assert_gt(player.health.current_health, wounded, "health restored")
	assert_eq(GameState.potion_charges, charges_before - 1, "one charge spent")


func test_potion_is_refused_while_on_cooldown() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	player.health.apply_damage(
		DamageInfo.new(100.0, GameEnums.DamageType.TRUE, GameEnums.Faction.ENEMY)
	)
	player.try_use_potion()
	var charges := GameState.potion_charges
	assert_false(player.try_use_potion(), "second potion refused")
	assert_eq(GameState.potion_charges, charges, "and no charge was wasted")


func test_potion_is_refused_when_empty() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	GameState.potion_charges = 0
	assert_false(player.try_use_potion(), "no charges, no potion")


func test_primary_attack_damages_an_enemy_in_front() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	var dummy := _spawn_dummy(2.0)
	await physics_frames(3)

	var health: HealthComponent = dummy["health"]
	var before := health.current_health
	assert_true(player.try_cast(AbilityComponent.SLOT_PRIMARY), "cast started")
	await physics_frames(24)
	assert_lt(health.current_health, before, "the cleave connected")


func test_the_floating_number_matches_the_damage_actually_applied() -> void:
	# End to end through a real class ability against an armoured target: what
	# the player is shown has to be what the health bar lost, or armour and
	# debuffs silently stop being legible.
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	var dummy := _spawn_dummy(2.0)
	var health: HealthComponent = dummy["health"]
	var stats: StatsComponent = dummy["stats"]
	stats.set_base_stat(GameEnums.Stat.ARMOR, 400.0)
	await physics_frames(3)

	var seen: Dictionary = {}
	EventBus.damage_number_requested.connect(
		func(_position: Vector3, info: DamageInfo) -> void:
			seen["shown"] = info.applied_amount,
		CONNECT_ONE_SHOT
	)

	var before := health.current_health
	assert_true(player.try_cast(AbilityComponent.SLOT_PRIMARY), "cast started")
	await physics_frames(24)

	var lost := before - health.current_health
	assert_gt(lost, 0.0, "the cleave connected")
	assert_almost_eq(
		float(seen.get("shown", -1.0)),
		lost,
		0.01,
		"the number on screen equals the health the target actually lost"
	)
	assert_lt(
		float(seen.get("shown", 0.0)),
		(player.class_data.primary_ability as AbilityData).compute_damage(
			AbilityContext.create(
				player, player.stats, GameEnums.Faction.PLAYER, player.aim_point
			)
		),
		"and it is visibly lower than the unmitigated swing, so armour reads on screen"
	)


func test_primary_attack_misses_an_enemy_behind_you() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	# Behind the player, outside the 120° cleave arc.
	var dummy := _spawn_dummy(-2.0)
	await physics_frames(3)

	var health: HealthComponent = dummy["health"]
	var before := health.current_health
	player.try_cast(AbilityComponent.SLOT_PRIMARY)
	await physics_frames(24)
	assert_almost_eq(
		health.current_health, before, 0.001, "a cleave does not hit what is behind you"
	)


func test_warrior_builds_rage_by_landing_hits() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	_spawn_dummy(2.0)
	await physics_frames(3)

	assert_almost_eq(player.stats.current_resource, 0.0, 0.001, "starts with no rage")
	player.try_cast(AbilityComponent.SLOT_PRIMARY)
	await physics_frames(24)
	assert_gt(player.stats.current_resource, 0.0, "connecting generates rage")


func test_wizard_frost_nova_chills_what_it_hits() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WIZARD)
	var dummy := _spawn_dummy(3.0)
	await physics_frames(3)

	assert_true(player.try_cast(AbilityComponent.SLOT_SECONDARY), "nova cast")
	await physics_frames(30)
	var status: StatusEffectComponent = dummy["status"]
	assert_true(
		status.has_effect(StatusEffectLibrary.CHILL),
		"Frost Nova applies its debuff through the shared hitbox payload"
	)


func test_ranger_multishot_spawns_a_fan_of_projectiles() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.RANGER)
	await physics_frames(3)

	assert_true(player.try_cast(AbilityComponent.SLOT_SECONDARY), "multishot cast")
	await physics_frames(20)

	var projectiles := 0
	for child in root.get_children():
		if child is Projectile:
			projectiles += 1
	var expected := (
		ClassLibrary.get_archetype(GameEnums.ClassId.RANGER).secondary_ability as ProjectileAbility
	).projectile_count
	assert_eq(projectiles, expected, "one projectile per arrow in the fan")


func test_attacks_are_gated_by_resource() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	player.stats.current_resource = 0.0
	assert_false(
		player.try_cast(AbilityComponent.SLOT_SECONDARY),
		"Shield Bash needs rage the warrior has not built yet"
	)


func test_death_moves_the_player_into_the_dead_state() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WIZARD)
	await physics_frames(2)

	var seen: Dictionary = {"died": false}
	EventBus.player_died.connect(func() -> void: seen["died"] = true, CONNECT_ONE_SHOT)
	player.health.kill()
	await physics_frames(2)

	assert_true(player.health.is_dead, "dead")
	assert_eq(player.state_machine.get_current_state_name(), &"Dead", "in the dead state")
	assert_true(bool(seen["died"]), "the death event reached the rest of the game")
	assert_false(player.try_cast(AbilityComponent.SLOT_PRIMARY), "corpses do not attack")
	assert_false(player.try_dodge(), "and do not dodge")


func test_full_restore_brings_the_player_back() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WIZARD)
	await physics_frames(2)

	player.health.kill()
	await physics_frames(2)
	player.health.full_restore()
	player.state_machine.travel(&"Idle", {}, true)
	await physics_frames(2)

	assert_false(player.health.is_dead, "alive again")
	assert_eq(player.state_machine.get_current_state_name(), &"Idle", "back in control")
	assert_true(player.try_cast(AbilityComponent.SLOT_PRIMARY), "and able to fight")


func test_stagger_interrupts_and_returns_control() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(2)

	player.apply_stagger(0.15)
	assert_eq(player.state_machine.get_current_state_name(), &"Stagger", "staggered")
	await physics_frames(20)
	assert_eq(player.state_machine.get_current_state_name(), &"Idle", "control returns")


func test_knockback_pushes_the_player() -> void:
	_add_floor()
	_spawn_player(GameEnums.ClassId.WARRIOR)
	await physics_frames(3)
	var start := player.global_position

	player.apply_knockback(Vector3(8.0, 0.0, 0.0))
	await physics_frames(6)
	assert_gt(
		player.global_position.x - start.x, 0.05, "a knockback blow actually moves the player"
	)
