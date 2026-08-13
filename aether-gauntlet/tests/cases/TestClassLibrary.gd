## Every archetype is complete, distinct, and scales with level.
extends TestCase

const ALL_CLASSES: Array[int] = [
	GameEnums.ClassId.WARRIOR,
	GameEnums.ClassId.WIZARD,
	GameEnums.ClassId.RANGER,
]


func get_suite_name() -> String:
	return "ClassLibrary"


func test_all_three_archetypes_exist() -> void:
	assert_eq(ClassLibrary.get_all().size(), 3, "three playable classes")
	for class_id in ALL_CLASSES:
		assert_not_null(
			ClassLibrary.get_archetype(class_id),
			"archetype %s is defined" % GameEnums.class_display_name(class_id)
		)


func test_every_class_has_a_full_kit() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		var label := data.display_name
		assert_not_null(data.primary_ability, "%s has a left-mouse ability" % label)
		assert_not_null(data.secondary_ability, "%s has a right-mouse ability" % label)
		assert_not_null(data.special_ability, "%s has an E special" % label)
		assert_eq(data.get_abilities().size(), 3, "%s kit is complete" % label)


func test_every_ability_is_identified_and_described() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		for ability in data.get_abilities():
			assert_ne(ability.id, &"", "%s ability has an id" % data.display_name)
			assert_ne(ability.display_name, "", "%s ability has a name" % data.display_name)
			assert_ne(ability.description, "", "%s ability has a tooltip" % data.display_name)
			assert_gt(ability.base_damage, 0.0, "%s ability deals damage" % ability.id)


func test_ability_ids_are_unique_across_classes() -> void:
	var seen: Dictionary = {}
	for class_id in ALL_CLASSES:
		for ability in ClassLibrary.get_archetype(class_id).get_abilities():
			assert_false(seen.has(ability.id), "ability id '%s' is not reused" % ability.id)
			seen[ability.id] = true


func test_slot_lookup_matches_the_kit() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		assert_eq(
			data.get_ability_for_slot(AbilityComponent.SLOT_PRIMARY),
			data.primary_ability,
			"primary slot maps to the primary ability"
		)
		assert_eq(
			data.get_ability_for_slot(AbilityComponent.SLOT_SECONDARY),
			data.secondary_ability,
			"secondary slot maps to the secondary ability"
		)
		assert_eq(
			data.get_ability_for_slot(AbilityComponent.SLOT_SPECIAL),
			data.special_ability,
			"special slot maps to the special ability"
		)


func test_each_class_uses_a_different_resource() -> void:
	var kinds: Array[int] = []
	for class_id in ALL_CLASSES:
		var kind := ClassLibrary.get_archetype(class_id).resource_kind
		assert_false(kinds.has(kind), "resource pools are not shared between classes")
		kinds.append(kind)


func test_primary_abilities_are_free_and_repeatable() -> void:
	for class_id in ALL_CLASSES:
		var primary := ClassLibrary.get_archetype(class_id).primary_ability
		assert_almost_eq(
			primary.resource_cost, 0.0, 0.001, "%s primary costs nothing" % primary.id
		)
		assert_almost_eq(
			primary.cooldown, 0.0, 0.001, "%s primary is spammable" % primary.id
		)


func test_specials_are_the_biggest_and_slowest_ability() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		assert_gt(
			data.special_ability.cooldown,
			data.secondary_ability.cooldown,
			"%s special has the longest cooldown" % data.display_name
		)
		assert_gt(
			data.special_ability.resource_cost,
			data.primary_ability.resource_cost,
			"%s special is the expensive one" % data.display_name
		)


func test_stats_grow_with_level() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		var level_1 := data.get_stats_for_level(1)
		var level_10 := data.get_stats_for_level(10)
		assert_gt(
			float(level_10[GameEnums.Stat.MAX_HEALTH]),
			float(level_1[GameEnums.Stat.MAX_HEALTH]),
			"%s gains health per level" % data.display_name
		)


func test_level_one_stats_match_the_authored_base() -> void:
	var warrior := ClassLibrary.get_archetype(GameEnums.ClassId.WARRIOR)
	var stats := warrior.get_stats_for_level(1)
	assert_almost_eq(
		float(stats[GameEnums.Stat.MAX_HEALTH]),
		float(warrior.base_stats[GameEnums.Stat.MAX_HEALTH]),
		0.001,
		"no per-level growth is applied at level 1"
	)


func test_per_level_growth_is_linear() -> void:
	var warrior := ClassLibrary.get_archetype(GameEnums.ClassId.WARRIOR)
	var per_level := float(warrior.stats_per_level[GameEnums.Stat.MAX_HEALTH])
	var base := float(warrior.base_stats[GameEnums.Stat.MAX_HEALTH])
	var at_five := float(warrior.get_stats_for_level(5)[GameEnums.Stat.MAX_HEALTH])
	assert_almost_eq(
		at_five, base + per_level * 4.0, 0.001, "level 5 has four levels of growth"
	)


func test_missing_stats_fall_back_to_the_defaults() -> void:
	var wizard := ClassLibrary.get_archetype(GameEnums.ClassId.WIZARD)
	var stats := wizard.get_stats_for_level(1)
	assert_true(
		stats.has(GameEnums.Stat.AREA_SIZE),
		"a class that never mentions area size still has a usable value"
	)
	assert_gt(float(stats[GameEnums.Stat.AREA_SIZE]), 0.0, "and it is not zero")


func test_classes_are_cached_not_rebuilt() -> void:
	assert_eq(
		ClassLibrary.get_archetype(GameEnums.ClassId.RANGER),
		ClassLibrary.get_archetype(GameEnums.ClassId.RANGER),
		"the same resource instance is reused, so runtime tuning sticks"
	)


func test_class_archetypes_are_meaningfully_different() -> void:
	var warrior := ClassLibrary.get_archetype(GameEnums.ClassId.WARRIOR)
	var wizard := ClassLibrary.get_archetype(GameEnums.ClassId.WIZARD)
	var ranger := ClassLibrary.get_archetype(GameEnums.ClassId.RANGER)

	assert_gt(
		float(warrior.base_stats[GameEnums.Stat.MAX_HEALTH]),
		float(wizard.base_stats[GameEnums.Stat.MAX_HEALTH]),
		"the bruiser is tougher than the caster"
	)
	assert_gt(
		float(ranger.base_stats[GameEnums.Stat.MOVE_SPEED]),
		float(warrior.base_stats[GameEnums.Stat.MOVE_SPEED]),
		"the skirmisher is faster than the bruiser"
	)
	assert_gt(
		ranger.dodge_distance, warrior.dodge_distance, "the skirmisher rolls further"
	)
	assert_lt(
		ranger.dodge_cooldown, wizard.dodge_cooldown, "and rolls more often"
	)


func test_every_class_has_a_usable_dodge() -> void:
	for class_id in ALL_CLASSES:
		var data := ClassLibrary.get_archetype(class_id)
		assert_gt(data.dodge_distance, 0.0, "%s dodge covers ground" % data.display_name)
		assert_gt(data.dodge_duration, 0.0, "%s dodge takes time" % data.display_name)
		assert_gt(
			data.dodge_iframe_time, 0.0, "%s dodge grants i-frames" % data.display_name
		)
		assert_between(
			data.dodge_iframe_time,
			0.0,
			data.dodge_duration,
			"%s i-frames end before the roll does, so late dodges still lose"
			% data.display_name
		)
