## Finite state machine over child [State] nodes.
##
## Add [State] children in the scene, point [member initial_state] at one and
## call [method setup] with the entity that owns the machine. The machine keeps
## a history of the previous state so states like "stagger" can return the
## entity to whatever it was doing.
class_name StateMachine
extends Node

## Fired after every successful transition.
signal state_changed(from_state: StringName, to_state: StringName)
## Fired when a transition was refused, either because the target does not
## exist or the current state declined to be interrupted.
signal transition_blocked(to_state: StringName, reason: StringName)

## State entered by [method setup]. Falls back to the first child [State].
@export var initial_state: State

var host: Node = null
var current_state: State = null
var previous_state_name: StringName = &""

var _states: Dictionary = {}   ## StringName -> State
var _is_running: bool = false


func _ready() -> void:
	set_process(false)
	set_physics_process(false)


## Register every child state and enter the initial one.
func setup(p_host: Node) -> void:
	host = p_host
	_states.clear()
	for child in get_children():
		var state := child as State
		if state == null:
			continue
		_states[StringName(state.name)] = state
		state.setup(host, self)

	var start := initial_state
	if start == null and not _states.is_empty():
		start = _states.values()[0] as State
	if start == null:
		push_error("StateMachine on '%s' has no State children." % str(get_path()))
		return

	_is_running = true
	set_process(true)
	set_physics_process(true)
	current_state = start
	current_state.enter({})
	state_changed.emit(&"", StringName(current_state.name))


func _process(delta: float) -> void:
	if _is_running and current_state != null:
		current_state.update(delta)


func _physics_process(delta: float) -> void:
	if _is_running and current_state != null:
		current_state.physics_update(delta)


func _unhandled_input(event: InputEvent) -> void:
	if _is_running and current_state != null:
		current_state.handle_input(event)


## Move to [param state_name]. Returns false when the transition was refused.
## [param force] skips the current state's [method State.can_interrupt] check —
## death and stagger use it.
func travel(state_name: StringName, message: Dictionary = {}, force: bool = false) -> bool:
	if not _is_running:
		return false
	if not _states.has(state_name):
		transition_blocked.emit(state_name, &"unknown_state")
		push_warning("StateMachine: no state named '%s'" % state_name)
		return false
	if current_state != null and StringName(current_state.name) == state_name:
		return false
	if current_state != null and not force and not current_state.can_interrupt():
		transition_blocked.emit(state_name, &"locked")
		return false

	var from_name: StringName = &"" if current_state == null else StringName(current_state.name)
	if current_state != null:
		current_state.exit()
	previous_state_name = from_name
	current_state = _states[state_name]
	current_state.enter(message)
	state_changed.emit(from_name, state_name)
	return true


## Name of the active state, empty before [method setup].
func get_current_state_name() -> StringName:
	return &"" if current_state == null else StringName(current_state.name)


## True when the active state is [param state_name].
func is_in_state(state_name: StringName) -> bool:
	return get_current_state_name() == state_name


## True when a state with this name was registered.
func has_state(state_name: StringName) -> bool:
	return _states.has(state_name)


## Look up a registered state, e.g. to read state-specific configuration.
func get_state(state_name: StringName) -> State:
	return _states.get(state_name, null) as State


## Stop updating states entirely (used while the game is paused or the entity
## is pooled).
func set_running(value: bool) -> void:
	_is_running = value
	set_process(value)
	set_physics_process(value)
