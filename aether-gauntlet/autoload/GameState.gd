## Persistent player profile.
##
## Everything that survives leaving an arena lives here: the chosen class, the
## character's level, potion charges and the crystal currencies. Scene-local
## state (the current wave, live enemies) belongs to the run manager instead.
extends Node

## The archetype the player is running.
var selected_class: GameEnums.ClassId = GameEnums.ClassId.WARRIOR
## Character level. Module B raises the cap to 60.
var level: int = 1
## Experience banked toward the next level.
var experience: int = 0

## Health potion charges carried into an arena.
var potion_charges: int = 3
## Charges the player is restocked to when a run starts or the Healer is used.
var potion_max_charges: int = 3
## Fraction of maximum health one potion restores.
var potion_heal_fraction: float = 0.4
## Seconds before another potion can be drunk.
var potion_cooldown: float = 12.0

## Soft currency (Module D's Merchant).
var gold: int = 0

## Crystal currencies (Module E). Keyed by [enum GameEnums.CrystalType].
var crystals: Dictionary = {
	GameEnums.CrystalType.WHITE: 0,
	GameEnums.CrystalType.BLUE: 0,
	GameEnums.CrystalType.RED: 0,
}


## Class data for the currently selected archetype.
func get_class_data() -> PlayerClassData:
	return ClassLibrary.get_archetype(selected_class)


## Choose an archetype. Returns false when the id is unknown.
func select_class(class_id: GameEnums.ClassId) -> bool:
	if ClassLibrary.get_archetype(class_id) == null:
		return false
	selected_class = class_id
	return true


## How many crystals of a type the player holds.
func get_crystals(crystal: GameEnums.CrystalType) -> int:
	return int(crystals.get(crystal, 0))


## Add crystals (negative to spend). Returns the new total.
func add_crystals(crystal: GameEnums.CrystalType, amount: int) -> int:
	var total := maxi(0, get_crystals(crystal) + amount)
	crystals[crystal] = total
	EventBus.crystals_changed.emit(crystal, total)
	return total


## Spend crystals if the player can afford it.
func spend_crystals(crystal: GameEnums.CrystalType, amount: int) -> bool:
	if amount <= 0:
		return true
	if get_crystals(crystal) < amount:
		return false
	add_crystals(crystal, -amount)
	return true


## Add gold, clamped at zero. Returns the new total.
func add_gold(amount: int) -> int:
	gold = maxi(0, gold + amount)
	EventBus.gold_changed.emit(gold)
	return gold


## Consume one potion charge. Returns false when none are left.
func consume_potion_charge() -> bool:
	if potion_charges <= 0:
		return false
	potion_charges -= 1
	EventBus.potion_used.emit(potion_charges)
	return true


## Refill potions, e.g. at the Healer or when a run begins.
func refill_potions() -> void:
	potion_charges = potion_max_charges
	EventBus.potion_used.emit(potion_charges)


## Reset the profile to a fresh character. Used by the class-select screen.
func reset_profile(class_id: GameEnums.ClassId) -> void:
	selected_class = class_id
	level = 1
	experience = 0
	gold = 0
	potion_charges = potion_max_charges
	for key: Variant in crystals.keys():
		crystals[key] = 0
