## Named collision layer bits.
##
## Godot's inspector shows layer *numbers*; code should never hard-code the
## resulting bitmask. Every physics body, hitbox and hurtbox in the project
## takes its layer/mask from these constants so that renumbering a layer is a
## single-file change.
class_name CollisionLayers
extends RefCounted

const WORLD: int = 1 << 0          ## Static level geometry, walls, floor.
const PLAYER_BODY: int = 1 << 1    ## The player's CharacterBody3D.
const ENEMY_BODY: int = 1 << 2     ## Enemy CharacterBody3D instances.

## Mask every character body uses: solid level geometry only.
##
## Characters deliberately do NOT collide with one another. Two capsules
## pushing together produce an upward contact normal, which
## [member CharacterBody3D.floor_max_angle] reads as walkable ground — so
## bodies climb each other, and a player standing on a mob's head sits above
## every melee hitbox in the game and cannot be touched. Godot's own
## documentation rules out the obvious alternative: [CylinderShape3D] has
## known collision bugs and will not even rest on a box floor.
##
## Characters are kept apart by steering instead — enemies hold their
## archetype's preferred range and push off their neighbours in
## [method Enemy._compute_separation] — which is both robust and the right feel
## for a wave arena, where being physically boxed in by a pack would be a
## death sentence rather than a challenge.
const CHARACTER_BODY_MASK: int = WORLD
const PLAYER_HITBOX: int = 1 << 3  ## Damage dealt *by* the player.
const ENEMY_HITBOX: int = 1 << 4   ## Damage dealt *by* enemies.
const PLAYER_HURTBOX: int = 1 << 5 ## The player's damageable volume.
const ENEMY_HURTBOX: int = 1 << 6  ## An enemy's damageable volume.
const INTERACTABLE: int = 1 << 7   ## NPCs, levers, stash, portals.
const PICKUP: int = 1 << 8         ## Ground loot and crystals.


## Layer a hitbox of [param faction] should occupy.
static func hitbox_layer(faction: GameEnums.Faction) -> int:
	return PLAYER_HITBOX if faction == GameEnums.Faction.PLAYER else ENEMY_HITBOX


## Mask a hitbox of [param faction] should scan, i.e. the hurtboxes it may hit.
static func hitbox_mask(faction: GameEnums.Faction) -> int:
	match faction:
		GameEnums.Faction.PLAYER:
			return ENEMY_HURTBOX
		GameEnums.Faction.ENEMY:
			return PLAYER_HURTBOX
	return 0


## Layer a hurtbox of [param faction] should occupy.
static func hurtbox_layer(faction: GameEnums.Faction) -> int:
	return PLAYER_HURTBOX if faction == GameEnums.Faction.PLAYER else ENEMY_HURTBOX
