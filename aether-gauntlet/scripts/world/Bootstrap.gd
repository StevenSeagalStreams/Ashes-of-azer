## Entry point.
##
## Its only job is to decide which scene the game opens on. Right now that is
## Module A's combat harness; when Module D lands the Town Hub, this is the one
## line that changes.
class_name Bootstrap
extends Node

## Scene loaded once the game starts.
@export_file("*.tscn") var start_scene: String = "res://scenes/world/CombatTestArena.tscn"
## Class the profile defaults to on a cold boot.
@export var default_class: GameEnums.ClassId = GameEnums.ClassId.WARRIOR


func _ready() -> void:
	GameState.select_class(default_class)
	GameState.refill_potions()
	# Deferred so the autoloads have finished their own _ready before the first
	# gameplay scene starts asking them questions.
	call_deferred(&"_enter_start_scene")


func _enter_start_scene() -> void:
	if start_scene.is_empty():
		push_error("Bootstrap has no start scene configured")
		return
	var error := get_tree().change_scene_to_file(start_scene)
	if error != OK:
		push_error("Bootstrap failed to load '%s' (error %d)" % [start_scene, error])
