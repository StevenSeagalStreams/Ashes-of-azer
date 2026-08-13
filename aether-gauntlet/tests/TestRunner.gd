## Headless test runner.
##
## Run with:
## [codeblock]
## godot --headless --path aether-gauntlet res://tests/TestRunner.tscn
## [/codeblock]
## Exits with code 0 when every assertion passed and 1 otherwise, so CI can
## gate on it.
extends Node

## Suites executed, in order. Add new case scripts here.
const SUITES: Array[GDScript] = [
	preload("res://tests/cases/TestDamageInfo.gd"),
	preload("res://tests/cases/TestStatsComponent.gd"),
	preload("res://tests/cases/TestHealthComponent.gd"),
	preload("res://tests/cases/TestStatusEffects.gd"),
	preload("res://tests/cases/TestStateMachine.gd"),
	preload("res://tests/cases/TestCombatVolumes.gd"),
	preload("res://tests/cases/TestAbilityMath.gd"),
	preload("res://tests/cases/TestAbilityComponent.gd"),
	preload("res://tests/cases/TestClassLibrary.gd"),
	preload("res://tests/cases/TestPlayer.gd"),
	preload("res://tests/cases/TestEnemy.gd"),
]

var _total_tests: int = 0
var _failed_tests: int = 0
var _total_assertions: int = 0
var _failure_lines: PackedStringArray = PackedStringArray()


func _ready() -> void:
	await _run_all()


func _run_all() -> void:
	print("")
	print("═══ Aether Gauntlet test suite ═══")
	var started_msec := Time.get_ticks_msec()

	for suite_script in SUITES:
		await _run_suite(suite_script)

	# Let the last batch of queue_free calls settle before the engine exits, so
	# a clean run does not report phantom leaks.
	await get_tree().process_frame
	await get_tree().process_frame

	var elapsed := (Time.get_ticks_msec() - started_msec) / 1000.0
	print("")
	print("─────────────────────────────────")
	print(
		"%d tests, %d assertions, %d failed  (%.2fs)"
		% [_total_tests, _total_assertions, _failed_tests, elapsed]
	)
	if _failed_tests > 0:
		print("")
		for line in _failure_lines:
			print(line)
		print("")
		print("RESULT: FAIL")
		get_tree().quit(1)
		return
	print("RESULT: PASS")
	get_tree().quit(0)


func _run_suite(suite_script: GDScript) -> void:
	var probe := suite_script.new() as TestCase
	if probe == null:
		push_error("Suite %s does not extend TestCase" % suite_script.resource_path)
		_failed_tests += 1
		return

	var suite_name := probe.get_suite_name()
	print("")
	print("▸ %s" % suite_name)

	for method_name in _collect_test_methods(suite_script):
		var case := suite_script.new() as TestCase
		var container := Node.new()
		container.name = "TestRoot"
		add_child(container)
		case.root = container

		case.before_each()
		await case.call(method_name)
		case.after_each()

		_total_tests += 1
		_total_assertions += case.assertion_count
		if case.failures.is_empty():
			print("  ✓ %s (%d assertions)" % [method_name, case.assertion_count])
		else:
			_failed_tests += 1
			print("  ✗ %s" % method_name)
			for failure in case.failures:
				print("      %s" % failure)
				_failure_lines.append("%s :: %s — %s" % [suite_name, method_name, failure])

		case.cleanup()
		container.queue_free()
		# Let queue_free settle so the next test starts from a clean tree.
		await get_tree().process_frame


func _collect_test_methods(suite_script: GDScript) -> PackedStringArray:
	var names := PackedStringArray()
	var instance: TestCase = suite_script.new() as TestCase
	if instance == null:
		return names
	for entry: Dictionary in instance.get_method_list():
		var method_name := String(entry.get("name", ""))
		if method_name.begins_with("test_") and not names.has(method_name):
			names.append(method_name)
	names.sort()
	return names
