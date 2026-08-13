## The damageable volume of an entity.
##
## A hurtbox is passive: it never scans for anything. Hitboxes find it and call
## [method receive_hit]. Keeping receipt in one place means armour zones, boss
## weak points and i-frame toggles are all one component away.
class_name HurtboxComponent
extends Area3D

## A hit was accepted and forwarded to the health component.
signal hit_received(info: DamageInfo)
## A hit was rejected (wrong faction, hurtbox disabled, owner already dead).
signal hit_rejected(info: DamageInfo, reason: StringName)

## Where accepted damage is applied.
@export var health: HealthComponent
## Side this hurtbox belongs to; hitboxes of the same faction cannot hurt it.
@export var faction: GameEnums.Faction = GameEnums.Faction.ENEMY
## Multiplier applied to incoming damage — 2.0 makes this a critical weak point.
@export var damage_multiplier: float = 1.0
## The node knockback and stagger should be applied to. Defaults to the owner.
@export var body_target: Node3D

var _enabled: bool = true


func _ready() -> void:
	collision_layer = CollisionLayers.hurtbox_layer(faction)
	collision_mask = 0
	monitoring = false
	monitorable = true
	if body_target == null:
		body_target = get_parent() as Node3D


## Change the side this hurtbox belongs to and refresh its collision layer.
func set_faction(value: GameEnums.Faction) -> void:
	faction = value
	collision_layer = CollisionLayers.hurtbox_layer(faction)


## Enable or disable damage receipt. Dodge i-frames use the health component's
## invulnerability instead; this is for phases where a boss is untargetable.
func set_enabled(value: bool) -> void:
	if _enabled == value:
		return
	_enabled = value
	monitorable = value
	set_deferred(&"monitorable", value)


## True when this hurtbox currently accepts hits.
func is_enabled() -> bool:
	return _enabled and health != null and health.is_alive()


## Called by a [HitboxComponent]. Returns the damage actually applied.
func receive_hit(info: DamageInfo) -> float:
	if not _enabled:
		hit_rejected.emit(info, &"disabled")
		return 0.0
	if health == null:
		hit_rejected.emit(info, &"no_health")
		return 0.0
	if not health.is_alive():
		hit_rejected.emit(info, &"dead")
		return 0.0
	if not info.can_affect(faction):
		hit_rejected.emit(info, &"faction")
		return 0.0

	var packet := info.copy()
	packet.amount = info.amount * damage_multiplier
	var dealt := health.apply_damage(packet)

	# Mirror the resolved outcome back onto the caller's packet. The hitbox
	# still owns that object and hands it to its own listeners — floating
	# numbers, on-hit hooks — which need the figure that actually landed, not
	# the one that was requested. Without this, armour, Sunder and weak-point
	# multipliers are all applied but invisible to the player, and the number
	# on screen contradicts the health bar.
	info.amount = packet.amount
	info.applied_amount = packet.applied_amount
	info.was_absorbed = packet.was_absorbed

	if dealt > 0.0:
		hit_received.emit(packet)
		_apply_reaction(packet)
	return dealt


func _apply_reaction(info: DamageInfo) -> void:
	if body_target == null:
		return
	if info.knockback > 0.0 and body_target.has_method(&"apply_knockback"):
		var direction := info.get_knockback_direction(body_target.global_position)
		if direction != Vector3.ZERO:
			body_target.call(&"apply_knockback", direction * info.knockback)
	if info.stagger > 0.0 and body_target.has_method(&"apply_stagger"):
		body_target.call(&"apply_stagger", info.stagger)
