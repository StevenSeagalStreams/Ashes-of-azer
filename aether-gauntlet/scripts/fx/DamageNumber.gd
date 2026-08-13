## A single floating combat number.
##
## Instances are pooled by [DamageNumberSpawner]; [method play] fully re-arms
## one, so a number that has already been used is indistinguishable from a
## fresh one.
class_name DamageNumber
extends Node3D

## The number finished animating and is ready to be recycled.
signal finished(number: DamageNumber)

## Seconds the number stays on screen.
@export var lifetime: float = 0.85
## Metres the number rises over its lifetime.
@export var rise_height: float = 1.6
## Metres of random horizontal scatter, so stacked hits stay readable.
@export var scatter: float = 0.55
## Font size of an ordinary hit.
@export var base_font_size: int = 48
## Font size multiplier applied to critical hits.
@export var critical_scale: float = 1.55

@onready var label: Label3D = $Label3D as Label3D

var _elapsed: float = 0.0
var _start_position: Vector3 = Vector3.ZERO
var _drift: Vector3 = Vector3.ZERO
var _playing: bool = false


func _ready() -> void:
	set_process(false)
	if label != null:
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true


func _process(delta: float) -> void:
	if not _playing:
		return
	_elapsed += delta
	var t := clampf(_elapsed / maxf(0.05, lifetime), 0.0, 1.0)
	# Rise fast then settle, which keeps the peak readable.
	var eased := 1.0 - pow(1.0 - t, 2.0)
	global_position = _start_position + Vector3.UP * rise_height * eased + _drift * eased
	if label != null:
		label.modulate.a = 1.0 - pow(t, 2.5)
		var pop := 1.0 + 0.25 * (1.0 - clampf(t * 5.0, 0.0, 1.0))
		label.pixel_size = 0.0035 * pop
	if t >= 1.0:
		_stop()


## Show [param info] at [param world_position]. Re-arms a pooled instance.
func play(world_position: Vector3, info: DamageInfo) -> void:
	_elapsed = 0.0
	_playing = true
	_start_position = world_position
	_drift = Vector3(randf_range(-scatter, scatter), 0.0, randf_range(-scatter, scatter))
	global_position = world_position
	visible = true
	if label != null:
		var value := maxi(1, roundi(info.applied_amount if info.applied_amount > 0.0 else info.amount))
		label.text = ("%d!" % value) if info.is_critical else str(value)
		label.font_size = int(base_font_size * (critical_scale if info.is_critical else 1.0))
		label.outline_size = 14 if info.is_critical else 10
		label.outline_modulate = Color(0.05, 0.04, 0.08, 0.9)
		var tint := GameEnums.damage_type_color(info.damage_type)
		label.modulate = tint.lightened(0.35) if info.is_critical else tint
	set_process(true)


## Stop immediately and release the instance back to its pool.
func _stop() -> void:
	_playing = false
	set_process(false)
	visible = false
	finished.emit(self)
