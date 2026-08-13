## Base class for a test case.
##
## A case is a plain object holding [code]test_*[/code] methods. The runner
## discovers them by reflection, so adding a test is adding a method. Cases
## that need a live scene tree get one through [member root]; anything added
## with [method track] is freed automatically after the test.
class_name TestCase
extends RefCounted

## Node the runner parents test-owned nodes to. Always inside the scene tree.
var root: Node = null
## Failure messages recorded during the current test.
var failures: PackedStringArray = PackedStringArray()
## How many assertions ran, so a silently empty test is visible.
var assertion_count: int = 0

var _owned: Array[Node] = []


## Human-readable name of the suite, shown in the report.
func get_suite_name() -> String:
	return "TestCase"


## Runs before each test method.
func before_each() -> void:
	pass


## Runs after each test method, before tracked nodes are freed.
func after_each() -> void:
	pass


# --- Node helpers -----------------------------------------------------------

## Take ownership of [param node] without adding it to the tree. Use this in
## [method before_each] for nodes a test may or may not end up installing —
## they still get freed either way.
func own(node: Node) -> Node:
	if not _owned.has(node):
		_owned.append(node)
	return node


## Parent [param node] to the test root and free it when the test ends.
func track(node: Node) -> Node:
	own(node)
	if root != null and node.get_parent() == null:
		root.add_child(node)
	return node


## Free every node this test created. Called by the runner.
func cleanup() -> void:
	for node in _owned:
		if not is_instance_valid(node):
			continue
		if node.is_inside_tree():
			node.queue_free()
		else:
			# Never entered the tree, so there is nothing to defer to.
			node.free()
	_owned.clear()


## Wait [param count] physics ticks, so the physics server sees new colliders.
func physics_frames(count: int = 1) -> void:
	if root == null:
		return
	for i in maxi(1, count):
		await root.get_tree().physics_frame


## Wait [param count] rendered frames, so [method Node._process] has run.
func process_frames(count: int = 1) -> void:
	if root == null:
		return
	for i in maxi(1, count):
		await root.get_tree().process_frame


# --- Assertions -------------------------------------------------------------

## Record a failure with [param message].
func fail(message: String) -> void:
	failures.append(message)


func assert_true(condition: bool, message: String = "") -> bool:
	assertion_count += 1
	if condition:
		return true
	fail("expected true — %s" % message)
	return false


func assert_false(condition: bool, message: String = "") -> bool:
	return assert_true(not condition, message)


func assert_eq(actual: Variant, expected: Variant, message: String = "") -> bool:
	assertion_count += 1
	if actual == expected:
		return true
	fail("expected %s, got %s — %s" % [str(expected), str(actual), message])
	return false


func assert_ne(actual: Variant, unexpected: Variant, message: String = "") -> bool:
	assertion_count += 1
	if actual != unexpected:
		return true
	fail("expected a value other than %s — %s" % [str(unexpected), message])
	return false


func assert_almost_eq(
	actual: float, expected: float, tolerance: float = 0.001, message: String = ""
) -> bool:
	assertion_count += 1
	if absf(actual - expected) <= tolerance:
		return true
	fail("expected %f ± %f, got %f — %s" % [expected, tolerance, actual, message])
	return false


func assert_gt(actual: float, threshold: float, message: String = "") -> bool:
	assertion_count += 1
	if actual > threshold:
		return true
	fail("expected greater than %f, got %f — %s" % [threshold, actual, message])
	return false


func assert_lt(actual: float, threshold: float, message: String = "") -> bool:
	assertion_count += 1
	if actual < threshold:
		return true
	fail("expected less than %f, got %f — %s" % [threshold, actual, message])
	return false


func assert_between(
	actual: float, low: float, high: float, message: String = ""
) -> bool:
	assertion_count += 1
	if actual >= low and actual <= high:
		return true
	fail("expected %f within [%f, %f] — %s" % [actual, low, high, message])
	return false


func assert_not_null(value: Variant, message: String = "") -> bool:
	assertion_count += 1
	if value != null:
		return true
	fail("expected non-null — %s" % message)
	return false


func assert_null(value: Variant, message: String = "") -> bool:
	assertion_count += 1
	if value == null:
		return true
	fail("expected null, got %s — %s" % [str(value), message])
	return false
