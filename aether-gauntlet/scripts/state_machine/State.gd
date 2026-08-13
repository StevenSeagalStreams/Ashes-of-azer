## Base class for a node-based state.
##
## States are children of a [StateMachine] and are addressed by their node
## name. Subclasses override the lifecycle hooks they care about and call
## [method transition_to] to hand control on.
class_name State
extends Node

## The entity this state drives (the Player, an Enemy, …).
var host: Node = null
## The machine that owns this state.
var machine: StateMachine = null


## Called once when the machine is set up, before any state is entered.
func setup(p_host: Node, p_machine: StateMachine) -> void:
	host = p_host
	machine = p_machine
	_on_setup()


## Override for one-time initialisation that needs [member host].
func _on_setup() -> void:
	pass


## Called when the state becomes active. [param message] carries hand-off data.
func enter(_message: Dictionary = {}) -> void:
	pass


## Called when the state stops being active.
func exit() -> void:
	pass


## Per-frame update while active.
func update(_delta: float) -> void:
	pass


## Per-physics-tick update while active.
func physics_update(_delta: float) -> void:
	pass


## Unhandled input while active.
func handle_input(_event: InputEvent) -> void:
	pass


## True when the machine is allowed to leave this state right now. Attack and
## dodge states use this to protect their committed frames.
func can_interrupt() -> bool:
	return true


## Shorthand for [code]machine.travel(...)[/code].
func transition_to(state_name: StringName, message: Dictionary = {}) -> bool:
	if machine == null:
		return false
	return machine.travel(state_name, message)
