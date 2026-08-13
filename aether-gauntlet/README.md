# Aether Gauntlet

A top-down 3D action RPG in Godot 4 / GDScript 2.0. Pick a class, spend Aether
Crystals to configure a run, step through a portal, and fight waves for loot.

> This project lives alongside — and is independent of — *Ashes of Azer* in the
> repository root. Nothing here touches that project's files.

## Running it

```bash
godot --path aether-gauntlet                 # play
godot --headless --path aether-gauntlet res://tests/TestRunner.tscn   # run tests
```

The test runner exits `0` when everything passes and `1` otherwise, so it can
gate CI directly.

## Module status

| Module | Scope | State |
| --- | --- | --- |
| A — Player & Combat Core | Camera, WASD, dodge, special, potion, LMB/RMB, three classes | Built |
| B — Progression & Skill Trees | Level 60 cap, XP curve, talent trees, respec | Not started |
| C — Inventory & Equipment | Grid bags, paperdoll, loot, stash | Not started |
| D — Town Hub & NPCs | Healer, Merchant, Quest Giver, Stash, Crystal + lever | Not started |
| E — Aether Crystal Engine | White/Blue/Red crystals, drop rates, Free Run rules | Not started |
| F — Biome Portals & Waves | Random biomes, wave spawner, boss, death loop | Not started |

## Controls (Module A)

| Input | Action |
| --- | --- |
| `WASD` | Move (camera-relative) |
| Mouse | Aim |
| `LMB` | Primary attack |
| `RMB` | Secondary attack |
| `E` | Special attack |
| `Q` | Dodge (invulnerability frames) |
| `F` | Health potion |
| `1` / `2` / `3` | Harness only: switch to Warrior / Wizard / Ranger |
| `4` | Harness only: clear the current batch of enemies |

## Architecture

Everything is built from small components that entities compose, so the player
and the enemies share one combat implementation:

- `HealthComponent` — hit points, armour mitigation, reference-counted
  invulnerability, death.
- `HurtboxComponent` — the damageable volume. Passive; it only receives.
- `HitboxComponent` — the damaging volume. Resolves overlap with a direct
  shape query rather than `area_entered`, so a swing connects on the frame it
  spawns and targets already standing inside are hit.
- `StatsComponent` — `(base + flat) * (1 + percent)` stat maths with modifiers
  grouped by source, plus the class resource pool (Rage / Mana / Focus).
- `StatusEffectComponent` — timed buffs and debuffs that push their modifiers
  through `StatsComponent` and their damage through `HealthComponent`.
- `AbilityComponent` — ability slots, cooldowns, and the wind-up → effect →
  recovery cast timeline with input buffering.
- `StateMachine` / `State` — node-based states with interrupt protection, so an
  attack's committed frames cannot be cancelled except by a forced transition
  (dodge, stagger, death).

Abilities are `Resource` subclasses (`MeleeArcAbility`, `ProjectileAbility`,
`NovaAbility`, `SpinAbility`, `GroundBlastAbility`) that receive an
`AbilityContext` per cast and hold no per-cast state, so one instance is shared
by every entity that owns it. Class kits are assembled in `ClassLibrary`, enemy
archetypes in `EnemyLibrary`.

## Layout

```
autoload/     EventBus (global signals), GameState (persistent profile)
scripts/
  core/       enums, collision layers, DamageInfo, status effect definitions
  components/ the reusable entity components listed above
  state_machine/
  abilities/  AbilityData base + the concrete ability types
  player/     Player, its states, PlayerClassData, ClassLibrary
  enemies/    Enemy, its AI states, EnemyData, EnemyLibrary
  camera/     TopDownCamera (follow, cursor lead, screen shake)
  fx/         hit-stop, telegraph decals, pooled damage numbers
  world/      Bootstrap, Projectile, the Module A combat harness
scenes/       one .tscn per script that needs a node tree
tests/        TestRunner + TestCase + one suite per system
```
