## Builds and caches the three playable archetypes.
##
## The kits live in code rather than in [code].tres[/code] files so that the
## tuning of every class sits on one readable page — the numbers below are the
## whole combat balance of Module A, and a reviewer can diff them.
class_name ClassLibrary
extends RefCounted

static var _classes: Dictionary = {}   ## ClassId -> PlayerClassData


## Class data for [param class_id]. Built once and reused.
static func get_archetype(class_id: GameEnums.ClassId) -> PlayerClassData:
	_ensure_built()
	return _classes.get(class_id, null) as PlayerClassData


## Every archetype, in class-select order.
static func get_all() -> Array[PlayerClassData]:
	_ensure_built()
	var out: Array[PlayerClassData] = []
	for class_id in [
		GameEnums.ClassId.WARRIOR, GameEnums.ClassId.WIZARD, GameEnums.ClassId.RANGER
	]:
		var data := _classes.get(class_id, null) as PlayerClassData
		if data != null:
			out.append(data)
	return out


static func _ensure_built() -> void:
	if not _classes.is_empty():
		return
	_classes[GameEnums.ClassId.WARRIOR] = _build_warrior()
	_classes[GameEnums.ClassId.WIZARD] = _build_wizard()
	_classes[GameEnums.ClassId.RANGER] = _build_ranger()


# --- Warrior ----------------------------------------------------------------

static func _build_warrior() -> PlayerClassData:
	var data := PlayerClassData.new()
	data.class_id = GameEnums.ClassId.WARRIOR
	data.display_name = "Warrior"
	data.description = (
		"A front-line bruiser. Builds Rage by landing hits and spends it on "
		+ "heavy, wide swings. Tough enough to stand in the middle of a wave."
	)
	data.resource_kind = GameEnums.ResourceKind.RAGE
	data.base_stats = {
		GameEnums.Stat.STRENGTH: 16.0,
		GameEnums.Stat.INTELLECT: 6.0,
		GameEnums.Stat.DEXTERITY: 8.0,
		GameEnums.Stat.VITALITY: 14.0,
		GameEnums.Stat.MAX_HEALTH: 180.0,
		GameEnums.Stat.HEALTH_REGEN: 1.5,
		GameEnums.Stat.MAX_RESOURCE: 100.0,
		GameEnums.Stat.RESOURCE_REGEN: 0.0,
		GameEnums.Stat.ATTACK_POWER: 12.0,
		GameEnums.Stat.SPELL_POWER: 4.0,
		GameEnums.Stat.ARMOR: 120.0,
		GameEnums.Stat.MOVE_SPEED: 5.8,
		GameEnums.Stat.CRIT_CHANCE: 0.05,
		GameEnums.Stat.CRIT_DAMAGE: 1.6,
	}
	data.stats_per_level = {
		GameEnums.Stat.STRENGTH: 2.2,
		GameEnums.Stat.VITALITY: 1.8,
		GameEnums.Stat.MAX_HEALTH: 22.0,
		GameEnums.Stat.ATTACK_POWER: 1.9,
		GameEnums.Stat.ARMOR: 9.0,
	}
	data.body_color = Color(0.82, 0.33, 0.24)
	data.dodge_distance = 5.0
	data.dodge_duration = 0.28
	data.dodge_cooldown = 1.2
	data.dodge_iframe_time = 0.22

	var cleave := MeleeArcAbility.new()
	cleave.id = &"warrior_cleave"
	cleave.display_name = "Cleave"
	cleave.description = "A wide sweep that hits everything in front of you for {damage} and builds Rage."
	cleave.cooldown = 0.0
	cleave.resource_cost = 0.0
	cleave.resource_gain_on_hit = 7.0
	cleave.windup = 0.09
	cleave.active_time = 0.12
	cleave.recovery = 0.19
	cleave.base_damage = 22.0
	cleave.scaling_coefficient = 1.0
	cleave.damage_type = GameEnums.DamageType.PHYSICAL
	cleave.knockback = 2.0
	cleave.impact_weight = 0.35
	cleave.move_speed_while_casting = 0.25
	cleave.radius = 2.8
	cleave.arc_degrees = 120.0
	cleave.forward_offset = 0.8
	cleave.lunge_distance = 0.5
	data.primary_ability = cleave

	var shield_bash := MeleeArcAbility.new()
	shield_bash.id = &"warrior_shield_bash"
	shield_bash.display_name = "Shield Bash"
	shield_bash.description = "Slam forward for {damage}, knocking enemies back and staggering them. Costs {cost} Rage."
	shield_bash.cooldown = 4.0
	shield_bash.resource_cost = 25.0
	shield_bash.windup = 0.16
	shield_bash.active_time = 0.14
	shield_bash.recovery = 0.24
	shield_bash.base_damage = 46.0
	shield_bash.scaling_coefficient = 1.35
	shield_bash.damage_type = GameEnums.DamageType.PHYSICAL
	shield_bash.knockback = 9.0
	shield_bash.stagger = 0.9
	shield_bash.impact_weight = 0.75
	shield_bash.status_effects = [StatusEffectLibrary.SUNDER]
	shield_bash.move_speed_while_casting = 0.0
	shield_bash.radius = 3.0
	shield_bash.arc_degrees = 70.0
	shield_bash.forward_offset = 1.1
	shield_bash.lunge_distance = 1.8
	data.secondary_ability = shield_bash

	var whirlwind := SpinAbility.new()
	whirlwind.id = &"warrior_whirlwind"
	whirlwind.display_name = "Whirlwind"
	whirlwind.description = "Spin for 2.4s, striking everything around you for {damage} every 0.35s. Costs {cost} Rage."
	whirlwind.cooldown = 11.0
	whirlwind.resource_cost = 40.0
	whirlwind.windup = 0.12
	whirlwind.active_time = 2.4
	whirlwind.recovery = 0.25
	whirlwind.scales_with_attack_speed = false
	whirlwind.base_damage = 18.0
	whirlwind.scaling_coefficient = 0.7
	whirlwind.damage_type = GameEnums.DamageType.PHYSICAL
	whirlwind.knockback = 1.0
	whirlwind.impact_weight = 0.25
	whirlwind.move_speed_while_casting = 0.65
	whirlwind.can_turn_while_casting = true
	whirlwind.radius = 3.4
	whirlwind.tick_interval = 0.35
	whirlwind.resource_per_second = 4.0
	data.special_ability = whirlwind
	return data


# --- Wizard -----------------------------------------------------------------

static func _build_wizard() -> PlayerClassData:
	var data := PlayerClassData.new()
	data.class_id = GameEnums.ClassId.WIZARD
	data.display_name = "Wizard"
	data.description = (
		"A ranged caster with the highest burst in the game and the thinnest "
		+ "health bar. Chills packs with Frost Nova, then drops a Meteor on them."
	)
	data.resource_kind = GameEnums.ResourceKind.MANA
	data.base_stats = {
		GameEnums.Stat.STRENGTH: 6.0,
		GameEnums.Stat.INTELLECT: 17.0,
		GameEnums.Stat.DEXTERITY: 8.0,
		GameEnums.Stat.VITALITY: 8.0,
		GameEnums.Stat.MAX_HEALTH: 120.0,
		GameEnums.Stat.HEALTH_REGEN: 1.0,
		GameEnums.Stat.MAX_RESOURCE: 140.0,
		GameEnums.Stat.RESOURCE_REGEN: 11.0,
		GameEnums.Stat.ATTACK_POWER: 5.0,
		GameEnums.Stat.SPELL_POWER: 13.0,
		GameEnums.Stat.ARMOR: 45.0,
		GameEnums.Stat.MOVE_SPEED: 6.0,
		GameEnums.Stat.CRIT_CHANCE: 0.08,
		GameEnums.Stat.CRIT_DAMAGE: 1.75,
	}
	data.stats_per_level = {
		GameEnums.Stat.INTELLECT: 2.4,
		GameEnums.Stat.VITALITY: 1.0,
		GameEnums.Stat.MAX_HEALTH: 13.0,
		GameEnums.Stat.MAX_RESOURCE: 5.0,
		GameEnums.Stat.SPELL_POWER: 2.1,
		GameEnums.Stat.ARMOR: 4.0,
	}
	data.body_color = Color(0.35, 0.45, 0.92)
	data.dodge_distance = 6.0
	data.dodge_duration = 0.22
	data.dodge_cooldown = 1.4
	data.dodge_iframe_time = 0.2

	var bolt := ProjectileAbility.new()
	bolt.id = &"wizard_arcane_bolt"
	bolt.display_name = "Arcane Bolt"
	bolt.description = "Hurl a bolt of raw aether for {damage}. Restores a little Mana on impact."
	bolt.cooldown = 0.0
	bolt.resource_cost = 0.0
	bolt.resource_gain_on_hit = 4.0
	bolt.windup = 0.11
	bolt.active_time = 0.05
	bolt.recovery = 0.24
	bolt.base_damage = 26.0
	bolt.scaling_stat = GameEnums.Stat.SPELL_POWER
	bolt.scaling_coefficient = 1.0
	bolt.damage_type = GameEnums.DamageType.ARCANE
	bolt.impact_weight = 0.25
	bolt.move_speed_while_casting = 0.3
	bolt.can_turn_while_casting = true
	bolt.projectile_count = 1
	bolt.projectile_speed = 22.0
	bolt.projectile_range = 24.0
	bolt.pierce_count = 0
	data.primary_ability = bolt

	var nova := NovaAbility.new()
	nova.id = &"wizard_frost_nova"
	nova.display_name = "Frost Nova"
	nova.description = "Erupt in frost for {damage} and Chill everything nearby. Costs {cost} Mana."
	nova.cooldown = 7.0
	nova.resource_cost = 35.0
	nova.windup = 0.14
	nova.active_time = 0.14
	nova.recovery = 0.26
	nova.base_damage = 40.0
	nova.scaling_stat = GameEnums.Stat.SPELL_POWER
	nova.scaling_coefficient = 1.1
	nova.damage_type = GameEnums.DamageType.FROST
	nova.status_effects = [StatusEffectLibrary.CHILL]
	nova.knockback = 3.0
	nova.impact_weight = 0.6
	nova.move_speed_while_casting = 0.0
	nova.radius = 5.2
	data.secondary_ability = nova

	var meteor := GroundBlastAbility.new()
	meteor.id = &"wizard_meteor"
	meteor.display_name = "Meteor"
	meteor.description = "Call down a burning rock for {damage} where you aim. Costs {cost} Mana."
	meteor.cooldown = 13.0
	meteor.resource_cost = 60.0
	meteor.windup = 0.3
	meteor.active_time = 0.2
	meteor.recovery = 0.35
	meteor.scales_with_attack_speed = false
	meteor.base_damage = 165.0
	meteor.scaling_stat = GameEnums.Stat.SPELL_POWER
	meteor.scaling_coefficient = 1.6
	meteor.damage_type = GameEnums.DamageType.FIRE
	meteor.status_effects = [StatusEffectLibrary.BURN]
	meteor.knockback = 5.0
	meteor.impact_weight = 1.0
	meteor.move_speed_while_casting = 0.0
	meteor.radius = 4.2
	meteor.telegraph_time = 0.75
	meteor.pulse_count = 1
	meteor.max_cast_range = 15.0
	data.special_ability = meteor
	return data


# --- Ranger -----------------------------------------------------------------

static func _build_ranger() -> PlayerClassData:
	var data := PlayerClassData.new()
	data.class_id = GameEnums.ClassId.RANGER
	data.display_name = "Ranger"
	data.description = (
		"A mobile skirmisher. Focus regenerates fast, rewarding constant "
		+ "repositioning and a steady stream of arrows into the pack."
	)
	data.resource_kind = GameEnums.ResourceKind.FOCUS
	data.base_stats = {
		GameEnums.Stat.STRENGTH: 8.0,
		GameEnums.Stat.INTELLECT: 8.0,
		GameEnums.Stat.DEXTERITY: 16.0,
		GameEnums.Stat.VITALITY: 10.0,
		GameEnums.Stat.MAX_HEALTH: 140.0,
		GameEnums.Stat.HEALTH_REGEN: 1.2,
		GameEnums.Stat.MAX_RESOURCE: 100.0,
		GameEnums.Stat.RESOURCE_REGEN: 16.0,
		GameEnums.Stat.ATTACK_POWER: 11.0,
		GameEnums.Stat.SPELL_POWER: 6.0,
		GameEnums.Stat.ARMOR: 70.0,
		GameEnums.Stat.MOVE_SPEED: 6.6,
		GameEnums.Stat.CRIT_CHANCE: 0.12,
		GameEnums.Stat.CRIT_DAMAGE: 1.8,
		GameEnums.Stat.ATTACK_SPEED: 1.15,
	}
	data.stats_per_level = {
		GameEnums.Stat.DEXTERITY: 2.3,
		GameEnums.Stat.VITALITY: 1.3,
		GameEnums.Stat.MAX_HEALTH: 16.0,
		GameEnums.Stat.ATTACK_POWER: 1.8,
		GameEnums.Stat.ARMOR: 6.0,
	}
	data.body_color = Color(0.35, 0.72, 0.4)
	data.dodge_distance = 6.5
	data.dodge_duration = 0.24
	data.dodge_cooldown = 0.95
	data.dodge_iframe_time = 0.24

	var quick_shot := ProjectileAbility.new()
	quick_shot.id = &"ranger_quick_shot"
	quick_shot.display_name = "Quick Shot"
	quick_shot.description = "A fast arrow for {damage} that builds Focus on hit."
	quick_shot.cooldown = 0.0
	quick_shot.resource_cost = 0.0
	quick_shot.resource_gain_on_hit = 5.0
	quick_shot.windup = 0.07
	quick_shot.active_time = 0.04
	quick_shot.recovery = 0.17
	quick_shot.base_damage = 21.0
	quick_shot.scaling_coefficient = 1.0
	quick_shot.damage_type = GameEnums.DamageType.PHYSICAL
	quick_shot.impact_weight = 0.2
	quick_shot.move_speed_while_casting = 0.45
	quick_shot.can_turn_while_casting = true
	quick_shot.projectile_count = 1
	quick_shot.projectile_speed = 30.0
	quick_shot.projectile_range = 26.0
	data.primary_ability = quick_shot

	var multishot := ProjectileAbility.new()
	multishot.id = &"ranger_multishot"
	multishot.display_name = "Multishot"
	multishot.description = "Loose a fan of five arrows, each for {damage}. Costs {cost} Focus."
	multishot.cooldown = 5.0
	multishot.resource_cost = 30.0
	multishot.windup = 0.15
	multishot.active_time = 0.05
	multishot.recovery = 0.28
	multishot.base_damage = 30.0
	multishot.scaling_coefficient = 1.15
	multishot.damage_type = GameEnums.DamageType.PHYSICAL
	multishot.status_effects = [StatusEffectLibrary.BLEED]
	multishot.impact_weight = 0.4
	multishot.move_speed_while_casting = 0.2
	multishot.projectile_count = 5
	multishot.spread_degrees = 46.0
	multishot.projectile_speed = 26.0
	multishot.projectile_range = 20.0
	multishot.pierce_count = 1
	multishot.damage_per_projectile = 0.75
	data.secondary_ability = multishot

	var arrow_storm := GroundBlastAbility.new()
	arrow_storm.id = &"ranger_arrow_storm"
	arrow_storm.display_name = "Arrow Storm"
	arrow_storm.description = "Rain arrows on an area, striking for {damage} six times. Costs {cost} Focus."
	arrow_storm.cooldown = 14.0
	arrow_storm.resource_cost = 55.0
	arrow_storm.windup = 0.22
	arrow_storm.active_time = 0.2
	arrow_storm.recovery = 0.3
	arrow_storm.scales_with_attack_speed = false
	arrow_storm.base_damage = 34.0
	arrow_storm.scaling_coefficient = 0.85
	arrow_storm.damage_type = GameEnums.DamageType.PHYSICAL
	arrow_storm.status_effects = [StatusEffectLibrary.BLEED]
	arrow_storm.impact_weight = 0.45
	arrow_storm.move_speed_while_casting = 0.0
	arrow_storm.radius = 4.6
	arrow_storm.telegraph_time = 0.55
	arrow_storm.pulse_count = 6
	arrow_storm.pulse_interval = 0.32
	arrow_storm.max_cast_range = 16.0
	data.special_ability = arrow_storm
	return data
