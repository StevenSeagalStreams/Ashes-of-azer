## Everything that distinguishes one playable archetype from another.
##
## The [Player] scene is class-agnostic: it reads its stats, resource pool,
## ability kit and dodge feel from this resource. Adding a fourth class means
## adding one more [PlayerClassData], not touching the player at all.
class_name PlayerClassData
extends Resource

## Which archetype this is.
@export var class_id: GameEnums.ClassId = GameEnums.ClassId.WARRIOR
## Name shown on the class-select screen and the character sheet.
@export var display_name: String = "Warrior"
## One-line pitch for the class-select screen.
@export_multiline var description: String = ""
## Pool the class spends on abilities.
@export var resource_kind: GameEnums.ResourceKind = GameEnums.ResourceKind.RAGE

## Stat values at level 1, mapping [enum GameEnums.Stat] to float.
@export var base_stats: Dictionary = {}
## Stat gained per level above 1, mapping [enum GameEnums.Stat] to float.
@export var stats_per_level: Dictionary = {}

## Left mouse button.
@export var primary_ability: AbilityData
## Right mouse button.
@export var secondary_ability: AbilityData
## The E key.
@export var special_ability: AbilityData

## Metres covered by one dodge.
@export var dodge_distance: float = 5.5
## Seconds the dodge movement lasts.
@export var dodge_duration: float = 0.26
## Seconds before the dodge can be used again.
@export var dodge_cooldown: float = 1.1
## Seconds of invulnerability inside the dodge, measured from its start.
@export var dodge_iframe_time: float = 0.22

## Body colour of the placeholder capsule mesh.
@export var body_color: Color = Color(0.85, 0.35, 0.25)
## Radius of the character's collision capsule.
@export var body_radius: float = 0.42
## Height of the character's collision capsule.
@export var body_height: float = 1.7


## Final base stat table for [param level], before gear and talents.
func get_stats_for_level(level: int) -> Dictionary:
	var levels_gained := float(maxi(1, level) - 1)
	var out := StatsComponent.DEFAULT_BASE.duplicate(true)
	for key: Variant in base_stats.keys():
		out[key] = float(base_stats[key])
	for key: Variant in stats_per_level.keys():
		var current := float(out.get(key, 0.0))
		out[key] = current + float(stats_per_level[key]) * levels_gained
	return out


## The three kit abilities in slot order, skipping unassigned ones.
func get_abilities() -> Array[AbilityData]:
	var out: Array[AbilityData] = []
	for ability in [primary_ability, secondary_ability, special_ability]:
		if ability != null:
			out.append(ability)
	return out


## Look up one of the kit abilities by slot key.
func get_ability_for_slot(slot: StringName) -> AbilityData:
	match slot:
		AbilityComponent.SLOT_PRIMARY: return primary_ability
		AbilityComponent.SLOT_SECONDARY: return secondary_ability
		AbilityComponent.SLOT_SPECIAL: return special_ability
	return null
