## Base class for every castable ability.
##
## An ability is a [Resource]: it carries no per-cast state, so one instance is
## shared by every entity that owns it. All per-cast information arrives in the
## [AbilityContext]. Subclasses override [method execute].
class_name AbilityData
extends Resource

## Stable identifier used by talents, item affixes and save data.
@export var id: StringName = &""
## Name shown on the action bar and in tooltips.
@export var display_name: String = "Ability"
## Tooltip body. [code]{damage}[/code] is substituted with the computed value.
@export_multiline var description: String = ""
## Icon shown on the action bar.
@export var icon: Texture2D
## Base cooldown in seconds, before cooldown reduction.
@export var cooldown: float = 1.0
## Resource spent on cast. The cast fails if the pool is too low.
@export var resource_cost: float = 0.0
## Resource granted immediately on a successful cast (generators).
@export var resource_gain: float = 0.0
## Resource granted for every enemy this ability damages.
@export var resource_gain_on_hit: float = 0.0

## Seconds of wind-up before the effect fires. Enemy telegraphs live here.
@export var windup: float = 0.05
## Seconds the effect stays live.
@export var active_time: float = 0.15
## Seconds of recovery after the effect ends, during which the caster is busy.
@export var recovery: float = 0.15
## When true, [member windup] and [member recovery] shrink with attack speed.
@export var scales_with_attack_speed: bool = true
## Movement speed multiplier while casting. 0 roots the caster.
@export_range(0.0, 1.0, 0.05) var move_speed_while_casting: float = 0.3
## When true the caster turns to follow the cursor during wind-up.
@export var can_turn_while_casting: bool = false

## Damage before stat scaling.
@export var base_damage: float = 10.0
## School of damage dealt.
@export var damage_type: GameEnums.DamageType = GameEnums.DamageType.PHYSICAL
## Stat the damage scales from.
@export var scaling_stat: GameEnums.Stat = GameEnums.Stat.ATTACK_POWER
## Multiplier on the scaling contribution. 1.0 means "full weapon damage".
@export var scaling_coefficient: float = 1.0
## Knockback impulse applied on hit, in metres/second.
@export var knockback: float = 0.0
## Stagger seconds applied on hit.
@export var stagger: float = 0.0
## Status effects applied on hit.
@export var status_effects: Array[StringName] = []
## Screen-shake / hit-stop weight. 0 = no impact feedback, 1 = heavy.
@export_range(0.0, 1.0, 0.05) var impact_weight: float = 0.3

## Value the scaling stat has at character creation, used to normalise scaling
## so that a coefficient of 1.0 means "exactly [member base_damage]" at start.
const SCALING_BASELINE: float = 10.0

## Shared area-of-effect shell. Its collision shape and mesh are authored at
## radius 1.0 so [method HitboxComponent.apply_area_scale] sets the radius in
## metres directly.
const AREA_HITBOX_SCENE: PackedScene = preload("res://scenes/abilities/AreaHitbox.tscn")


## Perform the ability. Subclasses must override this.
func execute(_ctx: AbilityContext) -> void:
	push_error("AbilityData.execute not implemented for '%s'" % id)


## Final damage per hit for this cast.
func compute_damage(ctx: AbilityContext) -> float:
	var scaling := ctx.get_stat(scaling_stat, SCALING_BASELINE)
	var multiplier := ctx.get_stat(GameEnums.Stat.DAMAGE_MULT, 1.0)
	return base_damage * (scaling / SCALING_BASELINE) * scaling_coefficient * multiplier


## Area multiplier for this cast, from [member GameEnums.Stat.AREA_SIZE].
func compute_area_scale(ctx: AbilityContext) -> float:
	return maxf(0.1, ctx.get_stat(GameEnums.Stat.AREA_SIZE, 1.0))


## Cooldown after the caster's cooldown reduction.
func compute_cooldown(ctx: AbilityContext) -> float:
	if ctx.stats == null:
		return cooldown
	return ctx.stats.apply_cooldown_reduction(cooldown)


## Total seconds the caster is locked into this ability.
func compute_cast_duration(ctx: AbilityContext) -> float:
	var speed := 1.0
	if scales_with_attack_speed:
		speed = maxf(0.1, ctx.get_stat(GameEnums.Stat.ATTACK_SPEED, 1.0))
	return (windup + active_time + recovery) / speed


## Seconds from cast start until the effect fires.
func compute_windup(ctx: AbilityContext) -> float:
	if not scales_with_attack_speed:
		return windup
	return windup / maxf(0.1, ctx.get_stat(GameEnums.Stat.ATTACK_SPEED, 1.0))


## Tooltip text with [code]{damage}[/code] and [code]{cooldown}[/code] filled in.
func get_tooltip(ctx: AbilityContext) -> String:
	var text := description
	text = text.replace("{damage}", str(roundi(compute_damage(ctx))))
	text = text.replace("{cooldown}", "%.1f" % compute_cooldown(ctx))
	text = text.replace("{cost}", str(roundi(resource_cost)))
	return text


## Configure a freshly spawned hitbox from this ability and the cast context.
## Shared by every subclass so damage, crit and status payloads never drift.
func configure_hitbox(hitbox: HitboxComponent, ctx: AbilityContext) -> void:
	hitbox.set_faction(ctx.faction)
	hitbox.damage = compute_damage(ctx)
	hitbox.damage_type = damage_type
	hitbox.knockback = knockback
	hitbox.stagger = stagger
	hitbox.crit_chance = ctx.get_stat(GameEnums.Stat.CRIT_CHANCE, 0.0)
	hitbox.crit_damage = ctx.get_stat(GameEnums.Stat.CRIT_DAMAGE, 1.5)
	hitbox.life_steal = ctx.get_stat(GameEnums.Stat.LIFE_STEAL, 0.0)
	hitbox.status_effects = status_effects.duplicate()
	hitbox.ability_id = id
	hitbox.source = ctx.caster
	# Hitboxes are spawned fresh for every cast, so the binding dies with them.
	hitbox.hit_landed.connect(_on_ability_hit_landed.bind(ctx))


## Shared on-hit reaction: resource generation, impact feedback and status
## application. Connected by [method configure_hitbox].
func _on_ability_hit_landed(
	hurtbox: HurtboxComponent, damage_dealt: float, info: DamageInfo, ctx: AbilityContext
) -> void:
	if resource_gain_on_hit > 0.0 and ctx.stats != null:
		ctx.stats.gain_resource(resource_gain_on_hit)
	if not status_effects.is_empty() and hurtbox != null:
		var target_status := _find_status_component(hurtbox)
		if target_status != null:
			target_status.apply_many(status_effects, ctx.caster)
	if hurtbox != null:
		EventBus.combat_impact.emit(hurtbox.global_position, impact_weight, info.is_critical)
		EventBus.damage_number_requested.emit(
			hurtbox.global_position + Vector3(0.0, 1.4, 0.0), info
		)
	if damage_dealt > 0.0 and ctx.stats != null:
		ctx.stats.notify_combat_activity()


## Node transient effects should be parented to. Falls back through the
## caster's parent, the caster itself and finally the scene root so an ability
## never silently fails to spawn.
func resolve_spawn_parent(ctx: AbilityContext) -> Node:
	if is_instance_valid(ctx.spawn_parent) and ctx.spawn_parent.is_inside_tree():
		return ctx.spawn_parent
	if is_instance_valid(ctx.caster) and ctx.caster.is_inside_tree():
		var parent := ctx.caster.get_parent()
		if parent != null:
			return parent
		return ctx.caster
	return null


## Spawn a configured area-of-effect hitbox in the world.
##
## [param radius] is in metres before the caster's AREA_SIZE stat is applied.
## [param attach_to_caster] parents the volume to the caster so it follows them
## (Whirlwind); otherwise it stays where it was spawned.
func spawn_area_hitbox(
	ctx: AbilityContext,
	world_position: Vector3,
	radius: float,
	arc: float = 360.0,
	attach_to_caster: bool = false,
	tick_interval: float = 0.0
) -> AbilityAreaFx:
	var parent: Node = ctx.caster if attach_to_caster else resolve_spawn_parent(ctx)
	if parent == null:
		push_error("AbilityData '%s': no valid parent to spawn its hitbox into" % id)
		return null

	var area := AREA_HITBOX_SCENE.instantiate() as AbilityAreaFx
	parent.add_child(area)
	area.global_transform = Transform3D(ctx.get_aim_basis(), world_position)

	var hitbox := area.hitbox
	configure_hitbox(hitbox, ctx)
	hitbox.arc_degrees = arc
	hitbox.tick_interval = tick_interval
	hitbox.apply_area_scale(maxf(0.05, radius) * compute_area_scale(ctx))
	area.set_color(_area_color())
	area.sync_size()
	return area


func _area_color() -> Color:
	var base := GameEnums.damage_type_color(damage_type)
	return Color(base.r, base.g, base.b, 0.45)


func _find_status_component(hurtbox: HurtboxComponent) -> StatusEffectComponent:
	var host := hurtbox.body_target
	if host == null:
		host = hurtbox.get_parent() as Node3D
	if host == null:
		return null
	if host.has_method(&"get_status_component"):
		return host.call(&"get_status_component") as StatusEffectComponent
	return host.get_node_or_null(^"StatusEffectComponent") as StatusEffectComponent
