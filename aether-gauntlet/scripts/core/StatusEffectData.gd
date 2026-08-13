## Definition of a timed buff or debuff.
##
## Effects are pure data so that talents (Module B) and item affixes (Module C)
## can hand new ones to [StatusEffectComponent] without touching combat code.
class_name StatusEffectData
extends Resource

## Unique id, e.g. [code]&"chill"[/code]. Used as the stat modifier source key.
@export var id: StringName = &""
## Name shown on the buff bar.
@export var display_name: String = ""
## Seconds the effect lasts. Refreshed when re-applied.
@export var duration: float = 3.0
## How many times the effect can stack. Stacks scale modifiers and damage.
@export_range(1, 99, 1) var max_stacks: int = 1
## Flat stat additions per stack, mapping [enum GameEnums.Stat] to float.
@export var flat_modifiers: Dictionary = {}
## Percentage stat modifiers per stack, e.g. -0.35 for a 35% slow.
@export var percent_modifiers: Dictionary = {}
## Damage per second per stack. 0 for a pure stat effect.
@export var damage_per_second: float = 0.0
## School used by [member damage_per_second].
@export var damage_type: GameEnums.DamageType = GameEnums.DamageType.NATURE
## Harmful effects can be cleansed; helpful ones are dispelled separately.
@export var is_debuff: bool = true
## Tint applied to the entity's mesh while the effect is active.
@export var tint: Color = Color(1, 1, 1, 1)
## Prevents the target from acting entirely (stun/freeze).
@export var is_incapacitating: bool = false


## Convenience constructor used by [StatusEffectLibrary].
static func create(
	p_id: StringName,
	p_name: String,
	p_duration: float,
	p_percent: Dictionary = {},
	p_dps: float = 0.0,
	p_damage_type: GameEnums.DamageType = GameEnums.DamageType.NATURE,
	p_max_stacks: int = 1
) -> StatusEffectData:
	var effect := StatusEffectData.new()
	effect.id = p_id
	effect.display_name = p_name
	effect.duration = p_duration
	effect.percent_modifiers = p_percent
	effect.damage_per_second = p_dps
	effect.damage_type = p_damage_type
	effect.max_stacks = p_max_stacks
	return effect


## Modifier bundles scaled to [param stacks], ready for [StatsComponent].
func get_scaled_flat(stacks: int) -> Dictionary:
	return _scale(flat_modifiers, stacks)


## Percentage bundle scaled to [param stacks].
func get_scaled_percent(stacks: int) -> Dictionary:
	return _scale(percent_modifiers, stacks)


func _scale(source: Dictionary, stacks: int) -> Dictionary:
	var out: Dictionary = {}
	var factor := float(maxi(1, stacks))
	for key: Variant in source.keys():
		out[key] = float(source[key]) * factor
	return out
