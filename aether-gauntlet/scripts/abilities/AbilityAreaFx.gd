## Visual shell around a spawned [HitboxComponent].
##
## Keeps the mesh in sync with the hitbox's real radius so what the player sees
## is exactly what damages — the readability half of the Diablo-style combat
## bar. Purely cosmetic: removing the mesh changes no gameplay.
class_name AbilityAreaFx
extends Node3D

## The hitbox this shell visualises.
@onready var hitbox: HitboxComponent = $Hitbox as HitboxComponent
@onready var visual: MeshInstance3D = $Visual as MeshInstance3D

## Seconds the flash takes to fade out once the hitbox stops.
@export var fade_time: float = 0.18
## Colour of the flash; abilities override it per damage school.
@export var color: Color = Color(1.0, 0.85, 0.4, 0.55)
## Free this node once the flash has faded. Abilities rely on this for cleanup,
## which is why the hitbox itself never frees its owner.
@export var free_after_fade: bool = true

var _material: StandardMaterial3D
var _fading: bool = false


func _ready() -> void:
	if visual != null:
		_material = StandardMaterial3D.new()
		_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_material.albedo_color = color
		_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		visual.material_override = _material
	if hitbox != null:
		hitbox.deactivated.connect(_on_hitbox_deactivated)
	_sync_visual_size()


## Tint the flash, e.g. frost blue for a Frost Nova.
func set_color(value: Color) -> void:
	color = value
	if _material != null:
		_material.albedo_color = value


## Match the mesh to the hitbox radius. Call after [method HitboxComponent.apply_area_scale].
func sync_size() -> void:
	_sync_visual_size()


func _sync_visual_size() -> void:
	if visual == null or hitbox == null:
		return
	var radius := hitbox.get_effective_radius()
	if radius <= 0.0:
		return
	# The base mesh is authored with radius 1.0, so scale is the radius itself.
	visual.scale = Vector3(radius, 1.0, radius)


func _on_hitbox_deactivated() -> void:
	if _fading:
		return
	_fading = true
	if _material == null:
		if free_after_fade:
			queue_free()
		return
	var tween := create_tween()
	tween.tween_property(_material, ^"albedo_color:a", 0.0, fade_time)
	if free_after_fade:
		tween.tween_callback(queue_free)
