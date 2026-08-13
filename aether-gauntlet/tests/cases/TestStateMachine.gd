## Transition rules, interrupt protection and forced transitions.
extends TestCase

## A state that refuses to be interrupted, standing in for an attack's
## committed frames.
class LockedState:
	extends State

	func can_interrupt() -> bool:
		return false


## A state that remembers what it was entered with.
class RecorderState:
	extends State

	var last_message: Dictionary = {}
	var enter_count: int = 0
	var exit_count: int = 0

	func enter(message: Dictionary = {}) -> void:
		last_message = message
		enter_count += 1

	func exit() -> void:
		exit_count += 1


var machine: StateMachine
var host_node: Node
var alpha: State
var beta: State
var locked: State
var recorder: RecorderState


func get_suite_name() -> String:
	return "StateMachine"


func before_each() -> void:
	host_node = Node.new()
	host_node.name = "Host"
	own(host_node)
	machine = StateMachine.new()
	machine.name = "StateMachine"
	own(machine)
	alpha = State.new()
	alpha.name = "Alpha"
	beta = State.new()
	beta.name = "Beta"
	locked = LockedState.new()
	locked.name = "Locked"
	recorder = RecorderState.new()
	recorder.name = "Recorder"
	machine.add_child(alpha)
	machine.add_child(beta)
	machine.add_child(locked)
	machine.add_child(recorder)
	machine.initial_state = alpha


func _install() -> void:
	track(host_node)
	track(machine)
	machine.setup(host_node)


func test_setup_enters_the_initial_state() -> void:
	_install()
	assert_eq(machine.get_current_state_name(), &"Alpha", "starts in the configured state")
	assert_true(machine.is_in_state(&"Alpha"), "is_in_state agrees")


func test_travel_switches_state_and_reports_it() -> void:
	_install()
	var seen: Dictionary = {}
	machine.state_changed.connect(
		func(from_state: StringName, to_state: StringName) -> void:
			seen["from"] = from_state
			seen["to"] = to_state
	)
	assert_true(machine.travel(&"Beta"), "transition accepted")
	assert_eq(machine.get_current_state_name(), &"Beta", "now in Beta")
	assert_eq(seen.get("from"), &"Alpha", "signal reports the previous state")
	assert_eq(seen.get("to"), &"Beta", "signal reports the new state")
	assert_eq(machine.previous_state_name, &"Alpha", "history recorded")


func test_travelling_to_the_current_state_is_a_no_op() -> void:
	_install()
	assert_false(machine.travel(&"Alpha"), "re-entering the active state is refused")


func test_unknown_states_are_refused() -> void:
	_install()
	var seen: Dictionary = {}
	machine.transition_blocked.connect(
		func(_to: StringName, blocked_reason: StringName) -> void: seen["reason"] = blocked_reason
	)
	assert_false(machine.travel(&"DoesNotExist"), "unknown target refused")
	assert_eq(seen.get("reason"), &"unknown_state", "reason reported")
	assert_eq(machine.get_current_state_name(), &"Alpha", "state unchanged")


func test_locked_states_block_ordinary_transitions() -> void:
	_install()
	machine.travel(&"Locked")
	assert_eq(machine.get_current_state_name(), &"Locked", "entered")

	var seen: Dictionary = {}
	machine.transition_blocked.connect(
		func(_to: StringName, blocked_reason: StringName) -> void: seen["reason"] = blocked_reason
	)
	assert_false(machine.travel(&"Beta"), "committed frames are protected")
	assert_eq(seen.get("reason"), &"locked", "reason reported")
	assert_eq(machine.get_current_state_name(), &"Locked", "still locked")


func test_forced_transitions_override_the_lock() -> void:
	_install()
	machine.travel(&"Locked")
	assert_true(machine.travel(&"Beta", {}, true), "a forced transition always wins")
	assert_eq(machine.get_current_state_name(), &"Beta", "dodge and death can always cut in")


func test_enter_receives_the_hand_off_message() -> void:
	_install()
	assert_true(machine.travel(&"Recorder", {"speed": 3.0}), "transition accepted")
	assert_eq(recorder.enter_count, 1, "entered once")
	assert_almost_eq(
		float(recorder.last_message.get("speed", 0.0)),
		3.0,
		0.001,
		"the hand-off payload reached the state"
	)


func test_exit_runs_when_leaving() -> void:
	_install()
	machine.travel(&"Recorder")
	machine.travel(&"Beta")
	assert_eq(recorder.exit_count, 1, "exit called exactly once on the way out")


func test_states_are_bound_to_their_host() -> void:
	_install()
	assert_eq(alpha.host, host_node, "host injected")
	assert_eq(alpha.machine, machine, "machine injected")


func test_set_running_stops_updates() -> void:
	_install()
	machine.set_running(false)
	assert_false(machine.travel(&"Beta"), "a stopped machine refuses transitions")
	machine.set_running(true)
	assert_true(machine.travel(&"Beta"), "and resumes when restarted")


func test_get_state_looks_up_registered_states() -> void:
	_install()
	assert_eq(machine.get_state(&"Beta"), beta, "lookup by name")
	assert_null(machine.get_state(&"Nope"), "unknown names return null")
	assert_true(machine.has_state(&"Locked"), "has_state agrees")
