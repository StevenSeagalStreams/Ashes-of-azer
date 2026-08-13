## Central enum registry for Aether Gauntlet.
##
## Every enum the game shares across modules lives here so that a value never
## has to be duplicated (and drift) between a component, a UI panel and a save
## file. Scripts refer to them as [code]GameEnums.Faction.PLAYER[/code].
class_name GameEnums
extends RefCounted


## Which side of the fight an entity belongs to. Hitboxes only damage
## hurtboxes of a different faction (NEUTRAL is never damaged by anyone).
enum Faction {
	PLAYER,
	ENEMY,
	NEUTRAL,
}

## Damage schools. TRUE ignores armour and resistances entirely.
enum DamageType {
	PHYSICAL,
	FIRE,
	FROST,
	ARCANE,
	NATURE,
	TRUE,
}

## The three playable archetypes.
enum ClassId {
	WARRIOR,
	WIZARD,
	RANGER,
}

## Per-class resource pool. Each behaves differently: rage is built by landing
## hits and decays out of combat, mana and focus regenerate passively.
enum ResourceKind {
	RAGE,
	MANA,
	FOCUS,
}

## Every stat the game can modify. Flat and percentage modifiers are applied on
## top of a base value by [StatsComponent].
enum Stat {
	# Primary attributes
	STRENGTH,
	INTELLECT,
	DEXTERITY,
	VITALITY,
	# Vitals
	MAX_HEALTH,
	HEALTH_REGEN,
	MAX_RESOURCE,
	RESOURCE_REGEN,
	# Offence
	ATTACK_POWER,
	SPELL_POWER,
	ATTACK_SPEED,
	CRIT_CHANCE,
	CRIT_DAMAGE,
	DAMAGE_MULT,
	AREA_SIZE,
	PROJECTILE_SPEED,
	LIFE_STEAL,
	# Defence / utility
	ARMOR,
	MOVE_SPEED,
	COOLDOWN_REDUCTION,
	DODGE_CHARGES,
}

## Equipment slots on the paperdoll (Module C).
enum EquipSlot {
	HEAD,
	CHEST,
	LEGS,
	WEAPON,
	OFF_HAND,
	AMULET,
	RING,
}

## Item quality tiers.
enum Rarity {
	COMMON,
	UNCOMMON,
	RARE,
	EPIC,
	LEGENDARY,
}

## Aether crystal currencies (Module E).
enum CrystalType {
	WHITE,
	BLUE,
	RED,
}


## Human readable name for a stat, used by tooltips and the character sheet.
static func stat_display_name(stat: Stat) -> String:
	match stat:
		Stat.STRENGTH: return "Strength"
		Stat.INTELLECT: return "Intellect"
		Stat.DEXTERITY: return "Dexterity"
		Stat.VITALITY: return "Vitality"
		Stat.MAX_HEALTH: return "Maximum Health"
		Stat.HEALTH_REGEN: return "Health Regeneration"
		Stat.MAX_RESOURCE: return "Maximum Resource"
		Stat.RESOURCE_REGEN: return "Resource Regeneration"
		Stat.ATTACK_POWER: return "Attack Power"
		Stat.SPELL_POWER: return "Spell Power"
		Stat.ATTACK_SPEED: return "Attack Speed"
		Stat.CRIT_CHANCE: return "Critical Chance"
		Stat.CRIT_DAMAGE: return "Critical Damage"
		Stat.DAMAGE_MULT: return "Damage"
		Stat.AREA_SIZE: return "Area of Effect"
		Stat.PROJECTILE_SPEED: return "Projectile Speed"
		Stat.LIFE_STEAL: return "Life Steal"
		Stat.ARMOR: return "Armor"
		Stat.MOVE_SPEED: return "Movement Speed"
		Stat.COOLDOWN_REDUCTION: return "Cooldown Reduction"
		Stat.DODGE_CHARGES: return "Dodge Charges"
	return "Unknown"


## Display name of a resource pool, e.g. the label above the resource bar.
static func resource_display_name(kind: ResourceKind) -> String:
	match kind:
		ResourceKind.RAGE: return "Rage"
		ResourceKind.MANA: return "Mana"
		ResourceKind.FOCUS: return "Focus"
	return "Resource"


## Bar colour for a resource pool.
static func resource_color(kind: ResourceKind) -> Color:
	match kind:
		ResourceKind.RAGE: return Color(0.85, 0.19, 0.16)
		ResourceKind.MANA: return Color(0.24, 0.45, 0.94)
		ResourceKind.FOCUS: return Color(0.26, 0.78, 0.44)
	return Color.WHITE


## Tint used for floating damage numbers and ability descriptions.
static func damage_type_color(damage_type: DamageType) -> Color:
	match damage_type:
		DamageType.PHYSICAL: return Color(0.96, 0.94, 0.88)
		DamageType.FIRE: return Color(1.0, 0.52, 0.18)
		DamageType.FROST: return Color(0.45, 0.83, 1.0)
		DamageType.ARCANE: return Color(0.75, 0.45, 1.0)
		DamageType.NATURE: return Color(0.5, 0.9, 0.35)
		DamageType.TRUE: return Color(1.0, 0.9, 0.35)
	return Color.WHITE


## Display name of a class archetype.
static func class_display_name(class_id: ClassId) -> String:
	match class_id:
		ClassId.WARRIOR: return "Warrior"
		ClassId.WIZARD: return "Wizard"
		ClassId.RANGER: return "Ranger"
	return "Unknown"


## Display name of an equipment slot.
static func equip_slot_display_name(slot: EquipSlot) -> String:
	match slot:
		EquipSlot.HEAD: return "Head"
		EquipSlot.CHEST: return "Chest"
		EquipSlot.LEGS: return "Legs"
		EquipSlot.WEAPON: return "Weapon"
		EquipSlot.OFF_HAND: return "Off-Hand"
		EquipSlot.AMULET: return "Amulet"
		EquipSlot.RING: return "Ring"
	return "Unknown"


## Display name of a crystal currency.
static func crystal_display_name(crystal: CrystalType) -> String:
	match crystal:
		CrystalType.WHITE: return "White Aether Crystal"
		CrystalType.BLUE: return "Blue Aether Crystal"
		CrystalType.RED: return "Red Aether Crystal"
	return "Unknown Crystal"
