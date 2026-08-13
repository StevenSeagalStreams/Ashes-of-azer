## A volume that deals damage to [HurtboxComponent]s of the opposing faction.
##
## Overlap is resolved with a direct space-state shape query rather than
## Area3D's [signal Area3D.area_entered] callbacks. That matters for feel: a
## melee swing spawned this frame connects *this* frame instead of waiting for
## the physics server to propagate enter events, and targets already standing
## inside the volume when it activates are hit like everything else.
class_name HitboxComponent
extends Area3D

## Damage was applied to a hurtbox.
signal hit_landed(hurtbox: HurtboxComponent, damage_dealt: float, info: DamageInfo)
## The hitbox became live.
signal activated()
## The hitbox stopped dealing damage (window elapsed or manually stopped).
signal deactivated()
## A scan finished having hit at least one target.
signal scan_connected(targets_hit: int)

## Damage per hit, before critical multipliers.
@export var damage: float = 10.0
## School of damage applied.
@export var damage_type: GameEnums.DamageType = GameEnums.DamageType.PHYSICAL
## Side dealing the damage; sets collision layer and mask on ready.
@export var faction: GameEnums.Faction = GameEnums.Faction.PLAYER
## Knockback impulse in metres/second.
@export var knockback: float = 0.0
## Stagger seconds inflicted on hit.
@export var stagger: float = 0.0
## 0..1 chance to critically strike.
@export var crit_chance: float = 0.0
## Damage multiplier on a critical strike.
@export var crit_damage: float = 1.5
## Fraction of damage dealt returned to the source as health.
@export var life_steal: float = 0.0
## Ability that spawned this hitbox, forwarded to on-hit hooks.
@export var ability_id: StringName = &""
## Status effect ids applied on hit.
@export var status_effects: Array[StringName] = []
## Cone half-width in degrees measured from -Z. 360 means a full circle.
@export_range(1.0, 360.0, 1.0) var arc_degrees: float = 360.0
## Node the cone is measured from. A melee volume is spawned ahead of whoever
## swung it, so the cone's apex belongs at the swinger — measuring it from the
## volume's own centre makes everything closer than that offset read as behind
## the swing and leaves a dead zone at the attacker's feet. Null means "measure
## from this hitbox", which is correct for volumes centred on their caster.
var arc_origin_node: Node3D = null
## Seconds before the same target can be hit again. 0 means "hit once only".
@export var tick_interval: float = 0.0
## Upper bound on targets damaged per scan; protects the frame budget.
@export var max_targets: int = 32
## Start scanning as soon as the node is ready.
@export var active_on_ready: bool = false
## Seconds the hitbox stays live when [member active_on_ready] is set.
## 0 means "until deactivated manually".
@export var active_duration: float = 0.0
## Free the owning node once the active window ends.
@export var free_owner_on_expire: bool = false

## The entity credited with the damage (player, enemy, or the ability caster).
var source: Node = null

var _is_active: bool = false
var _time_left: float = 0.0
var _endless: bool = false
var _hit_times: Dictionary = {}          ## instance_id -> seconds since activation
var _elapsed: float = 0.0
var _shape_node: CollisionShape3D
var _query: PhysicsShapeQueryParameters3D


func _ready() -> void:
	collision_layer = CollisionLayers.hitbox_layer(faction)
	collision_mask = CollisionLayers.hitbox_mask(faction)
	monitoring = false
	monitorable = false
	_shape_node = _find_shape_node()
	_query = PhysicsShapeQueryParameters3D.new()
	_query.collide_with_areas = true
	_query.collide_with_bodies = false
	if source == null:
		source = get_parent()
	set_physics_process(false)
	if active_on_ready:
		activate(active_duration)


func _physics_process(delta: float) -> void:
	_elapsed += delta
	scan()
	if not _endless:
		_time_left -= delta
		if _time_left <= 0.0:
			deactivate()


# --- Lifecycle --------------------------------------------------------------

## Begin dealing damage. [param duration] of 0 or less keeps the hitbox live
## until [method deactivate] is called.
func activate(duration: float = 0.0) -> void:
	_hit_times.clear()
	_elapsed = 0.0
	_endless = duration <= 0.0
	_time_left = duration
	_is_active = true
	set_physics_process(true)
	activated.emit()
	# Connect on the activation frame so instant abilities feel instant.
	scan()


## Stop dealing damage.
func deactivate() -> void:
	if not _is_active:
		return
	_is_active = false
	set_physics_process(false)
	deactivated.emit()
	if free_owner_on_expire:
		var host := get_parent()
		if host != null:
			host.queue_free()
		else:
			queue_free()


## True while the hitbox is scanning.
func is_active() -> bool:
	return _is_active


## Forget which targets have been hit, so a multi-swing combo can re-hit them.
func reset_hit_memory() -> void:
	_hit_times.clear()


# --- Configuration ----------------------------------------------------------

## Update the faction and refresh collision layer/mask accordingly.
func set_faction(value: GameEnums.Faction) -> void:
	faction = value
	collision_layer = CollisionLayers.hitbox_layer(faction)
	collision_mask = CollisionLayers.hitbox_mask(faction)


## Scale the collision shape by [param factor] (the AREA_SIZE stat). The shape
## resource is duplicated first so scaling never leaks into other instances.
func apply_area_scale(factor: float) -> void:
	if _shape_node == null or _shape_node.shape == null or is_equal_approx(factor, 1.0):
		return
	var shape: Shape3D = _shape_node.shape.duplicate()
	if shape is SphereShape3D:
		(shape as SphereShape3D).radius *= factor
	elif shape is CylinderShape3D:
		var cylinder := shape as CylinderShape3D
		cylinder.radius *= factor
	elif shape is BoxShape3D:
		var box := shape as BoxShape3D
		box.size = Vector3(box.size.x * factor, box.size.y, box.size.z * factor)
	elif shape is CapsuleShape3D:
		(shape as CapsuleShape3D).radius *= factor
	_shape_node.shape = shape


## Radius of the collision shape on the XZ plane, for telegraph visuals.
func get_effective_radius() -> float:
	if _shape_node == null or _shape_node.shape == null:
		return 0.0
	var shape := _shape_node.shape
	if shape is SphereShape3D:
		return (shape as SphereShape3D).radius
	if shape is CylinderShape3D:
		return (shape as CylinderShape3D).radius
	if shape is CapsuleShape3D:
		return (shape as CapsuleShape3D).radius
	if shape is BoxShape3D:
		return maxf((shape as BoxShape3D).size.x, (shape as BoxShape3D).size.z) * 0.5
	return 0.0


## Copy damage-relevant configuration from another hitbox (used when an ability
## clones a template hitbox onto a spawned instance).
func copy_damage_profile_from(other: HitboxComponent) -> void:
	damage = other.damage
	damage_type = other.damage_type
	knockback = other.knockback
	stagger = other.stagger
	crit_chance = other.crit_chance
	crit_damage = other.crit_damage
	life_steal = other.life_steal
	ability_id = other.ability_id
	status_effects = other.status_effects.duplicate()
	set_faction(other.faction)


# --- Scanning ---------------------------------------------------------------

## Run one overlap scan immediately. Returns how many targets were damaged.
func scan() -> int:
	if not _is_active or _shape_node == null or _shape_node.shape == null:
		return 0
	if not is_inside_tree():
		return 0
	var space := get_world_3d().direct_space_state
	if space == null:
		return 0

	_query.shape = _shape_node.shape
	_query.transform = _shape_node.global_transform
	_query.collision_mask = collision_mask

	var results := space.intersect_shape(_query, max_targets)
	var hits := 0
	for result: Dictionary in results:
		var collider: Object = result.get("collider")
		var hurtbox := collider as HurtboxComponent
		if hurtbox == null:
			continue
		if not _can_hit(hurtbox):
			continue
		var info := _build_damage_info()
		var dealt := hurtbox.receive_hit(info)
		# Remember the attempt either way, so an i-framed target is not re-hit
		# on every physics tick of the same swing.
		_hit_times[hurtbox.get_instance_id()] = _elapsed
		if dealt <= 0.0:
			continue
		hits += 1
		hit_landed.emit(hurtbox, dealt, info)
		_apply_life_steal(dealt)
	if hits > 0:
		scan_connected.emit(hits)
	return hits


func _can_hit(hurtbox: HurtboxComponent) -> bool:
	if not hurtbox.is_enabled():
		return false
	if hurtbox.faction == faction:
		return false
	var id := hurtbox.get_instance_id()
	if _hit_times.has(id):
		if tick_interval <= 0.0:
			return false
		if _elapsed - float(_hit_times[id]) < tick_interval:
			return false
	return _is_within_arc(hurtbox)


## World position the cone's apex sits at.
func get_arc_origin() -> Vector3:
	if is_instance_valid(arc_origin_node) and arc_origin_node.is_inside_tree():
		return arc_origin_node.global_position
	return global_position


func _is_within_arc(hurtbox: HurtboxComponent) -> bool:
	if arc_degrees >= 359.9:
		return true
	var to_target := hurtbox.global_position - get_arc_origin()
	to_target.y = 0.0
	if to_target.length_squared() < 0.0001:
		return true
	var forward := -global_transform.basis.z
	forward.y = 0.0
	if forward.length_squared() < 0.0001:
		return true
	var angle := rad_to_deg(forward.normalized().angle_to(to_target.normalized()))
	return angle <= arc_degrees * 0.5


func _build_damage_info() -> DamageInfo:
	var info := DamageInfo.new(damage, damage_type, faction, source)
	info.origin = global_position
	info.ability_id = ability_id
	info.knockback = knockback
	info.stagger = stagger
	info.life_steal = life_steal
	info.status_effects = status_effects.duplicate()
	if crit_chance > 0.0 and randf() < crit_chance:
		info.is_critical = true
		info.amount = damage * crit_damage
	return info


func _apply_life_steal(dealt: float) -> void:
	if life_steal <= 0.0 or source == null:
		return
	var health: HealthComponent = null
	if source.has_method(&"get_health_component"):
		health = source.call(&"get_health_component") as HealthComponent
	if health == null:
		health = source.get_node_or_null(^"HealthComponent") as HealthComponent
	if health != null:
		health.heal(dealt * life_steal)


func _find_shape_node() -> CollisionShape3D:
	for child in get_children():
		if child is CollisionShape3D:
			return child as CollisionShape3D
	return null
