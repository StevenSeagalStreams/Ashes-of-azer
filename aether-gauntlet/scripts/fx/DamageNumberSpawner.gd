## Pooled spawner for floating combat numbers.
##
## A wave arena can produce hundreds of numbers a second, so instances are
## recycled rather than allocated and freed. The pool is pre-warmed at ready so
## the first big pull does not stutter, and it is hard-capped so a runaway
## damage-over-time can never exhaust memory.
class_name DamageNumberSpawner
extends Node3D

const DAMAGE_NUMBER_SCENE: PackedScene = preload("res://scenes/fx/DamageNumber.tscn")

## Instances created up front.
@export var prewarm_count: int = 48
## Hard ceiling on live instances. Requests beyond it are dropped.
@export var max_live: int = 160
## Skip numbers below this damage so chip damage does not spam the screen.
@export var minimum_damage: float = 1.0

var _pool: Array[DamageNumber] = []
var _live_count: int = 0


func _ready() -> void:
	for i in prewarm_count:
		var instance := _create_instance()
		instance.visible = false
		_pool.append(instance)
	EventBus.damage_number_requested.connect(_on_number_requested)


## Show a number for [param info] at [param world_position].
func spawn(world_position: Vector3, info: DamageInfo) -> DamageNumber:
	var value := info.applied_amount if info.applied_amount > 0.0 else info.amount
	if value < minimum_damage:
		return null
	if _live_count >= max_live:
		return null
	var instance := _acquire()
	if instance == null:
		return null
	_live_count += 1
	instance.play(world_position, info)
	return instance


## Live instance count, for the debug overlay.
func get_live_count() -> int:
	return _live_count


func _acquire() -> DamageNumber:
	while not _pool.is_empty():
		var candidate := _pool.pop_back() as DamageNumber
		if is_instance_valid(candidate):
			return candidate
	return _create_instance()


func _create_instance() -> DamageNumber:
	var instance := DAMAGE_NUMBER_SCENE.instantiate() as DamageNumber
	add_child(instance)
	instance.finished.connect(_on_number_finished)
	return instance


func _on_number_finished(number: DamageNumber) -> void:
	_live_count = maxi(0, _live_count - 1)
	if is_instance_valid(number):
		_pool.append(number)


func _on_number_requested(world_position: Vector3, info: DamageInfo) -> void:
	spawn(world_position, info)
