## Hit-stop: the brief global slow-down that makes a blow feel like it connected.
##
## Only the heaviest hits get it, and never for long — a couple of frames at a
## time. Stacking is deliberately not allowed, so a Whirlwind mowing through
## twelve enemies does not turn the game into slow motion.
class_name CombatFeedback
extends Node

## Longest hit-stop the system will ever apply, in real seconds.
@export var max_freeze_time: float = 0.09
## Impact weight below which no hit-stop happens at all.
@export_range(0.0, 1.0, 0.05) var weight_threshold: float = 0.5
## Time scale used during a freeze.
@export_range(0.02, 0.9, 0.01) var freeze_time_scale: float = 0.12
## Extra freeze fraction granted to critical hits.
@export var critical_bonus: float = 0.5

var _is_frozen: bool = false
var _freeze_end_msec: int = 0


func _ready() -> void:
	# Freezes are measured in wall-clock time, so this node must keep running
	# regardless of pause state or the time scale it is itself setting.
	process_mode = Node.PROCESS_MODE_ALWAYS
	EventBus.combat_impact.connect(_on_combat_impact)


func _process(_delta: float) -> void:
	if not _is_frozen:
		return
	if Time.get_ticks_msec() >= _freeze_end_msec:
		_end_freeze()


func _exit_tree() -> void:
	# Never leave the engine in slow motion if the scene is torn down mid-hit.
	if _is_frozen:
		_end_freeze()


## Trigger hit-stop directly, for scripted moments like a boss phase change.
func freeze(seconds: float) -> void:
	var duration := clampf(seconds, 0.0, max_freeze_time)
	if duration <= 0.0:
		return
	var end_msec := Time.get_ticks_msec() + int(duration * 1000.0)
	_freeze_end_msec = maxi(_freeze_end_msec, end_msec)
	if not _is_frozen:
		_is_frozen = true
		Engine.time_scale = freeze_time_scale


## True while a hit-stop is in progress.
func is_frozen() -> bool:
	return _is_frozen


func _end_freeze() -> void:
	_is_frozen = false
	_freeze_end_msec = 0
	Engine.time_scale = 1.0


func _on_combat_impact(_world_position: Vector3, weight: float, is_critical: bool) -> void:
	if weight < weight_threshold:
		return
	var strength := weight
	if is_critical:
		strength *= 1.0 + critical_bonus
	freeze(max_freeze_time * clampf(strength, 0.0, 1.0))
