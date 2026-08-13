## Module A's playable harness.
##
## Not the real game loop — Module F replaces this with the wave arena. What it
## exists to do is exercise every part of the combat core by hand: all three
## classes, every ability slot, the dodge, the potion, enemy telegraphs, death
## and respawn. Keeping it as a scene rather than a unit test means the parts
## that only a human can judge (does the dodge feel like an escape?) can
## actually be judged.
class_name CombatTestArena
extends Node3D

const PLAYER_SCENE: PackedScene = preload("res://scenes/player/Player.tscn")
const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/Enemy.tscn")

## Enemies spawned per wave of the harness.
@export var enemies_per_wave: int = 6
## Metres from the arena centre enemies appear at.
@export var spawn_radius: float = 14.0
## Level the harness spawns enemies at.
@export var enemy_level: int = 1
## Seconds after the last enemy dies before the next batch appears.
@export var respawn_delay: float = 2.5
## Seconds after the player dies before they are restored.
@export var player_respawn_delay: float = 2.0
## Spawn a boss archetype alongside each batch.
@export var include_boss: bool = false

@onready var enemy_container: Node3D = $Enemies as Node3D
@onready var player_spawn: Marker3D = $PlayerSpawn as Marker3D
@onready var debug_label: Label = $DebugLayer/DebugLabel as Label

var player: Player = null

var _respawn_timer: float = 0.0
var _batch_index: int = 0


func _ready() -> void:
	EventBus.player_died.connect(_on_player_died)
	_spawn_player()
	_spawn_batch()


func _process(delta: float) -> void:
	_handle_debug_input()
	_tick_respawn(delta)
	_update_debug_label()


# --- Spawning ---------------------------------------------------------------

func _spawn_player() -> void:
	if is_instance_valid(player):
		return
	player = PLAYER_SCENE.instantiate() as Player
	add_child(player)
	player.global_position = player_spawn.global_position


func _spawn_batch() -> void:
	_batch_index += 1
	var archetypes := EnemyLibrary.get_trash_archetypes()
	if archetypes.is_empty():
		return
	for index in enemies_per_wave:
		var angle := TAU * float(index) / float(maxi(1, enemies_per_wave))
		var offset := Vector3(cos(angle), 0.0, sin(angle)) * spawn_radius
		_spawn_enemy(archetypes[index % archetypes.size()], offset)
	if include_boss:
		_spawn_enemy(EnemyLibrary.get_enemy(EnemyLibrary.WARDEN), Vector3(0.0, 0.0, -spawn_radius))
	EventBus.announcement_requested.emit("Batch %d" % _batch_index, 1.5)


func _spawn_enemy(archetype: EnemyData, offset: Vector3) -> Enemy:
	if archetype == null:
		return null
	var enemy := ENEMY_SCENE.instantiate() as Enemy
	enemy.configure(archetype, enemy_level)
	enemy_container.add_child(enemy)
	enemy.global_position = global_position + offset + Vector3(0.0, 0.1, 0.0)
	enemy.home_position = enemy.global_position
	return enemy


func _count_living_enemies() -> int:
	var count := 0
	for child in enemy_container.get_children():
		var enemy := child as Enemy
		if enemy != null and not enemy.health.is_dead:
			count += 1
	return count


func _tick_respawn(delta: float) -> void:
	if _respawn_timer > 0.0:
		_respawn_timer = maxf(0.0, _respawn_timer - delta)
		if _respawn_timer == 0.0:
			_spawn_batch()
		return
	if _count_living_enemies() == 0:
		_respawn_timer = respawn_delay


# --- Harness controls -------------------------------------------------------

func _handle_debug_input() -> void:
	if not is_instance_valid(player):
		return
	if Input.is_action_just_pressed(&"quickbar_1"):
		_switch_class(GameEnums.ClassId.WARRIOR)
	elif Input.is_action_just_pressed(&"quickbar_2"):
		_switch_class(GameEnums.ClassId.WIZARD)
	elif Input.is_action_just_pressed(&"quickbar_3"):
		_switch_class(GameEnums.ClassId.RANGER)
	elif Input.is_action_just_pressed(&"quickbar_4"):
		_clear_enemies()


func _switch_class(class_id: GameEnums.ClassId) -> void:
	GameState.select_class(class_id)
	player.apply_class(GameState.get_class_data(), GameState.level)
	player.abilities.reset_cooldowns()
	GameState.refill_potions()
	EventBus.announcement_requested.emit(
		GameEnums.class_display_name(class_id), 1.2
	)


func _clear_enemies() -> void:
	for child in enemy_container.get_children():
		var enemy := child as Enemy
		if enemy != null and not enemy.health.is_dead:
			enemy.health.kill()


func _on_player_died() -> void:
	get_tree().create_timer(player_respawn_delay).timeout.connect(_respawn_player)


func _respawn_player() -> void:
	if not is_instance_valid(player):
		_spawn_player()
		return
	player.health.full_restore()
	player.status.clear_all()
	player.abilities.reset_cooldowns()
	player.global_position = player_spawn.global_position
	player.state_machine.travel(&"Idle", {}, true)
	GameState.refill_potions()


# --- Debug readout ----------------------------------------------------------

func _update_debug_label() -> void:
	if debug_label == null:
		return
	if not is_instance_valid(player) or player.class_data == null:
		debug_label.text = "Spawning…"
		return

	var stats := player.stats
	var lines := PackedStringArray()
	lines.append("AETHER GAUNTLET — Module A harness   %d fps" % Engine.get_frames_per_second())
	lines.append(
		"Class: %s   (1/2/3 switch class, 4 clear wave)"
		% player.class_data.display_name
	)
	lines.append(
		"HP %d/%d    %s %d/%d"
		% [
			roundi(player.health.current_health),
			roundi(player.health.get_max_health()),
			GameEnums.resource_display_name(stats.resource_kind),
			roundi(stats.current_resource),
			roundi(stats.get_stat(GameEnums.Stat.MAX_RESOURCE)),
		]
	)
	lines.append(
		"LMB %s   RMB %s   E %s"
		% [
			_slot_readout(AbilityComponent.SLOT_PRIMARY),
			_slot_readout(AbilityComponent.SLOT_SECONDARY),
			_slot_readout(AbilityComponent.SLOT_SPECIAL),
		]
	)
	lines.append(
		"Q dodge %s   F potion x%d %s   state: %s"
		% [
			_timer_readout(player.get_dodge_cooldown_remaining()),
			GameState.potion_charges,
			_timer_readout(player.get_potion_cooldown_remaining()),
			player.state_machine.get_current_state_name(),
		]
	)
	lines.append("Enemies alive: %d" % _count_living_enemies())
	debug_label.text = "\n".join(lines)


func _slot_readout(slot: StringName) -> String:
	if not is_instance_valid(player):
		return "-"
	var ability := player.abilities.get_ability(slot)
	if ability == null:
		return "-"
	var remaining := player.abilities.get_cooldown_remaining(slot)
	if remaining > 0.0:
		return "%s (%.1fs)" % [ability.display_name, remaining]
	return ability.display_name


func _timer_readout(seconds: float) -> String:
	return "ready" if seconds <= 0.0 else "%.1fs" % seconds
