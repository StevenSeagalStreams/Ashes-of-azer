## Built-in enemy archetypes.
##
## Three shapes of pressure — something that closes, something that keeps its
## distance, and something that punishes standing still — which is enough for
## a wave to read as a fight rather than a queue.
class_name EnemyLibrary
extends RefCounted

const GRUNT: StringName = &"grunt"
const ARCHER: StringName = &"archer"
const BRUTE: StringName = &"brute"
const WARDEN: StringName = &"warden"

static var _registry: Dictionary = {}


## Archetype by id, or null.
static func get_enemy(id: StringName) -> EnemyData:
	_ensure_built()
	return _registry.get(id, null) as EnemyData


## Every archetype id.
static func get_ids() -> Array[StringName]:
	_ensure_built()
	var out: Array[StringName] = []
	for key: Variant in _registry.keys():
		out.append(key)
	return out


## Every non-boss archetype, for wave spawn tables.
static func get_trash_archetypes() -> Array[EnemyData]:
	_ensure_built()
	var out: Array[EnemyData] = []
	for key: Variant in _registry.keys():
		var data := _registry[key] as EnemyData
		if data != null and not data.is_boss:
			out.append(data)
	return out


## Register or replace an archetype.
static func register(data: EnemyData) -> void:
	_ensure_built()
	if data == null or data.id == &"":
		return
	_registry[data.id] = data


static func _ensure_built() -> void:
	if not _registry.is_empty():
		return
	_registry[GRUNT] = _build_grunt()
	_registry[ARCHER] = _build_archer()
	_registry[BRUTE] = _build_brute()
	_registry[WARDEN] = _build_warden()


static func _build_grunt() -> EnemyData:
	var data := EnemyData.new()
	data.id = GRUNT
	data.display_name = "Ashen Grunt"
	data.base_health = 55.0
	data.base_attack_power = 9.0
	data.base_armor = 15.0
	data.move_speed = 4.4
	data.base_experience = 11
	data.preferred_range = 1.8
	data.attack_interval = 1.3
	data.body_color = Color(0.72, 0.31, 0.33)

	var swipe := MeleeArcAbility.new()
	swipe.id = &"grunt_swipe"
	swipe.display_name = "Swipe"
	swipe.cooldown = 1.2
	swipe.windup = 0.45
	swipe.active_time = 0.12
	swipe.recovery = 0.35
	swipe.scales_with_attack_speed = false
	swipe.base_damage = 12.0
	swipe.scaling_coefficient = 1.0
	swipe.damage_type = GameEnums.DamageType.PHYSICAL
	swipe.knockback = 3.0
	swipe.impact_weight = 0.3
	swipe.move_speed_while_casting = 0.0
	swipe.radius = 2.4
	swipe.arc_degrees = 100.0
	swipe.forward_offset = 0.8
	swipe.lunge_distance = 0.6
	data.attack_ability = swipe
	return data


static func _build_archer() -> EnemyData:
	var data := EnemyData.new()
	data.id = ARCHER
	data.display_name = "Cinder Archer"
	data.base_health = 40.0
	data.base_attack_power = 11.0
	data.base_armor = 8.0
	data.move_speed = 4.0
	data.base_experience = 14
	data.preferred_range = 10.0
	data.aggro_radius = 26.0
	data.attack_interval = 2.0
	data.body_color = Color(0.85, 0.62, 0.28)

	var shot := ProjectileAbility.new()
	shot.id = &"archer_shot"
	shot.display_name = "Cinder Arrow"
	shot.cooldown = 1.8
	shot.windup = 0.6
	shot.active_time = 0.05
	shot.recovery = 0.4
	shot.scales_with_attack_speed = false
	shot.base_damage = 14.0
	shot.scaling_coefficient = 1.0
	shot.damage_type = GameEnums.DamageType.FIRE
	shot.impact_weight = 0.2
	shot.move_speed_while_casting = 0.0
	shot.projectile_count = 1
	shot.projectile_speed = 16.0
	shot.projectile_range = 22.0
	shot.accuracy_spread_degrees = 6.0
	data.attack_ability = shot
	return data


static func _build_brute() -> EnemyData:
	var data := EnemyData.new()
	data.id = BRUTE
	data.display_name = "Slag Brute"
	data.base_health = 150.0
	data.base_attack_power = 16.0
	data.base_armor = 40.0
	data.move_speed = 3.4
	data.base_experience = 28
	data.preferred_range = 2.6
	data.attack_interval = 2.4
	data.stagger_resistance = 0.4
	data.body_radius = 0.62
	data.body_height = 2.3
	data.body_color = Color(0.55, 0.28, 0.55)

	var slam := GroundBlastAbility.new()
	slam.id = &"brute_slam"
	slam.display_name = "Ground Slam"
	slam.cooldown = 2.2
	slam.windup = 0.1
	slam.active_time = 0.2
	slam.recovery = 0.6
	slam.scales_with_attack_speed = false
	slam.base_damage = 30.0
	slam.scaling_coefficient = 1.0
	slam.damage_type = GameEnums.DamageType.PHYSICAL
	slam.knockback = 8.0
	slam.stagger = 0.5
	slam.impact_weight = 0.85
	slam.move_speed_while_casting = 0.0
	slam.radius = 4.0
	slam.telegraph_time = 0.9
	slam.pulse_count = 1
	slam.max_cast_range = 4.0
	data.attack_ability = slam
	return data


static func _build_warden() -> EnemyData:
	var data := EnemyData.new()
	data.id = WARDEN
	data.display_name = "Aether Warden"
	data.base_health = 900.0
	data.base_attack_power = 24.0
	data.base_armor = 90.0
	data.move_speed = 3.8
	data.base_experience = 400
	data.preferred_range = 3.0
	data.attack_interval = 1.8
	data.stagger_resistance = 0.0
	data.body_radius = 0.9
	data.body_height = 3.0
	data.body_color = Color(0.35, 0.85, 0.9)
	data.is_boss = true

	var sweep := NovaAbility.new()
	sweep.id = &"warden_sweep"
	sweep.display_name = "Aether Sweep"
	sweep.cooldown = 1.6
	sweep.windup = 0.8
	sweep.active_time = 0.18
	sweep.recovery = 0.5
	sweep.scales_with_attack_speed = false
	sweep.base_damage = 42.0
	sweep.scaling_coefficient = 1.0
	sweep.damage_type = GameEnums.DamageType.ARCANE
	sweep.knockback = 10.0
	sweep.stagger = 0.6
	sweep.impact_weight = 1.0
	sweep.move_speed_while_casting = 0.0
	sweep.radius = 6.5
	data.attack_ability = sweep
	return data
