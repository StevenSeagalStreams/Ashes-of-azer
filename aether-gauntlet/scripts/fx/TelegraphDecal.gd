## Ground marker that fills up before an area attack lands.
##
## Every delayed area attack in the game — the Wizard's Meteor, the Ranger's
## Arrow Storm, every enemy slam — shows one of these first. The rule the whole
## combat design leans on is that nothing damaging happens off-screen or
## unannounced; the player is always told where not to stand.
class_name TelegraphDecal
extends Node3D

## The fill finished; the attack should land now.
signal completed()

## Colour of the outline and fill.
@export var color: Color = Color(1.0, 0.35, 0.2, 1.0)
## Seconds the fill takes.
@export var duration: float = 0.8
## Free the decal once the fill completes.
@export var free_on_complete: bool = true

@onready var fill: MeshInstance3D = $Fill as MeshInstance3D
@onready var ring: MeshInstance3D = $Ring as MeshInstance3D

var _fill_material: StandardMaterial3D
var _ring_material: StandardMaterial3D
var _elapsed: float = 0.0
var _radius: float = 1.0
var _running: bool = false


func _ready() -> void:
	_fill_material = _make_material(Color(color.r, color.g, color.b, 0.30))
	_ring_material = _make_material(Color(color.r, color.g, color.b, 0.85))
	if fill != null:
		fill.material_override = _fill_material
		fill.scale = Vector3(0.01, 1.0, 0.01)
	if ring != null:
		ring.material_override = _ring_material
	set_process(false)


func _process(delta: float) -> void:
	if not _running:
		return
	_elapsed += delta
	var t := clampf(_elapsed / maxf(0.01, duration), 0.0, 1.0)
	if fill != null:
		var scale_xz := _radius * t
		fill.scale = Vector3(maxf(0.01, scale_xz), 1.0, maxf(0.01, scale_xz))
	if _ring_material != null:
		# Pulse faster as the strike approaches.
		var pulse := 0.55 + 0.45 * sin(_elapsed * lerpf(6.0, 26.0, t))
		_ring_material.albedo_color = Color(color.r, color.g, color.b, pulse)
	if t >= 1.0:
		_finish()


## Start the fill at [param radius] metres over [param seconds].
func start(radius: float, seconds: float) -> void:
	_radius = maxf(0.05, radius)
	duration = maxf(0.01, seconds)
	_elapsed = 0.0
	_running = true
	if ring != null:
		ring.scale = Vector3(_radius, 1.0, _radius)
	if fill != null:
		fill.scale = Vector3(0.01, 1.0, 0.01)
	set_process(true)


## Stop early without emitting [signal completed], e.g. the caster died.
func cancel() -> void:
	_running = false
	set_process(false)
	if free_on_complete:
		queue_free()


func _finish() -> void:
	_running = false
	set_process(false)
	completed.emit()
	if free_on_complete:
		queue_free()


func _make_material(albedo: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.albedo_color = albedo
	material.no_depth_test = true
	return material
