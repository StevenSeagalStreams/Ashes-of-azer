## Definition of an enemy archetype.
##
## Module F scales these per mob level; the archetype itself only describes the
## shape of the fight — how far it reaches, how hard it hits, how long it winds
## up before it does.
class_name EnemyData
extends Resource

## Stable identifier used by spawn tables and bounties.
@export var id: StringName = &"grunt"
## Name shown on the target frame.
@export var display_name: String = "Grunt"

## Health at mob level 1.
@export var base_health: float = 60.0
## Attack power at mob level 1.
@export var base_attack_power: float = 10.0
## Armour at mob level 1.
@export var base_armor: float = 20.0
## Metres per second.
@export var move_speed: float = 4.2
## Experience granted on death at mob level 1.
@export var base_experience: int = 12

## How close the enemy tries to get before attacking, in metres.
@export var preferred_range: float = 2.0
## Metres at which the enemy notices the player.
@export var aggro_radius: float = 22.0
## Metres beyond which the enemy gives up and returns to idle.
@export var leash_radius: float = 40.0
## Seconds between attack attempts, on top of the ability's own cooldown.
@export var attack_interval: float = 1.4
## Seconds the enemy hesitates after taking a heavy hit.
@export var stagger_resistance: float = 1.0

## The attack it uses. Its wind-up doubles as the telegraph.
@export var attack_ability: AbilityData

## Body colour of the placeholder capsule.
@export var body_color: Color = Color(0.75, 0.3, 0.35)
## Collision capsule radius.
@export var body_radius: float = 0.45
## Collision capsule height.
@export var body_height: float = 1.8
## Marks the archetype as a boss: bigger, tougher, immune to stagger.
@export var is_boss: bool = false


## Stat table for [param mob_level]. Health and damage grow geometrically so a
## ten-level gap is a real wall rather than a rounding error.
func get_stats_for_level(mob_level: int) -> Dictionary:
	var level := maxi(1, mob_level)
	var growth := pow(1.12, float(level - 1))
	var linear := 1.0 + 0.08 * float(level - 1)
	return {
		GameEnums.Stat.MAX_HEALTH: base_health * growth,
		GameEnums.Stat.ATTACK_POWER: base_attack_power * growth,
		GameEnums.Stat.SPELL_POWER: base_attack_power * growth,
		GameEnums.Stat.ARMOR: base_armor * linear,
		GameEnums.Stat.MOVE_SPEED: move_speed,
		GameEnums.Stat.CRIT_CHANCE: 0.05,
		GameEnums.Stat.CRIT_DAMAGE: 1.5,
		GameEnums.Stat.MAX_RESOURCE: 100.0,
		GameEnums.Stat.RESOURCE_REGEN: 25.0,
		GameEnums.Stat.HEALTH_REGEN: 0.0,
	}


## Experience granted for a kill at [param mob_level].
func get_experience_for_level(mob_level: int) -> int:
	var level := maxi(1, mob_level)
	return int(round(float(base_experience) * pow(1.15, float(level - 1))))
