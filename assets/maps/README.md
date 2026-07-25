# Tiled map conventions

Maps are authored in [Tiled](https://www.mapeditor.org/) (free desktop editor)
and saved as **JSON** (`.json`, Tiled's "JSON map format") in this folder.
Phaser loads them directly — adding or editing a map never requires code
changes, matching the project's data-driven rule.

`scripts/generate-maps.mjs` originally froze the prototype's procedural
layouts into these files; the committed JSON files are now the source of
truth and can be opened/edited in Tiled directly.

## Tileset

- Single tileset named **`tiles`**: `tiles.png`, 16×16 tiles in one row
  (9 tiles). The game renders from a procedurally generated texture with
  identical pixels; the PNG exists so Tiled shows the same art.
- Tile ids: 0 grass · 1 tree · 2 water · 3 path · 4 dungeon-door · 5 dungeon
  floor · 6 dungeon wall · 7 exit portal · 8 flowers.
- **Collision** is a per-tile boolean property **`solid`** on the tileset
  (true on tree/water/dungeon-wall). The game calls
  `setCollisionByProperty({ solid: true })` — new solid tiles need only the
  property, no code.

## Layers (every map must have all three)

| Layer      | Type         | Purpose                                  |
| ---------- | ------------ | ---------------------------------------- |
| `ground`   | Tile layer   | The world. Collision via `solid` tiles.  |
| `spawns`   | Object layer | Player + enemy placement.                |
| `triggers` | Object layer | Regions the player activates by touch.   |

## Object types — `spawns` layer

Set the object's **Class** (shown as *Type* in older Tiled) to one of:

- **`player_spawn`** (point) — where the player enters this zone by default.
  Exactly one per map.
- **`enemy_spawn`** (point) — one enemy at a fixed spot. Optional string
  property `pool`: comma-separated enemy ids (from `data/enemies.json`);
  one is picked at random. Defaults to the zone's `enemyTypes`
  (`data/zones.json`).
- **`enemy_region`** (rectangle) — `count` (int) enemies scattered on random
  walkable tiles inside the rectangle. Same optional `pool`. Optional
  respawning: `respawn` (bool), `respawnCap` (int), `respawnInterval`
  (float, seconds).

## Object types — `triggers` layer

- **`transition`** (rectangle) — walking into it moves the player to another
  zone. Properties: `target` (string, zone id from `data/zones.json`),
  `targetX`/`targetY` (float, pixel position in the target map). Transitions
  autosave.
- **`heal`** (rectangle) — restores `rate` (float) hp/second while the
  player stands inside.
- **`cutscene`** (rectangle) — reserved: parsed and validated, but has no
  runtime behaviour until the cutscene system lands (Milestone 2.x).
  Property: `cutsceneId` (string).

Unknown object types are a **load error** (fail loudly), not silently
ignored — typos surface immediately.

## Adding a new zone

1. Create `assets/maps/<zoneId>.json` with the three layers above.
2. Add the zone to `data/zones.json` (`id` = the file name, `name`, `dark`
   for tighter/darker fog, `enemyTypes`).
3. Register the map key in `BootScene`'s preload list — currently the one
   place that enumerates map files.
4. Link it with a `transition` trigger from an existing zone.
