# Zone production checklist

The repeatable recipe for building a new zone, distilled from Zone 2 (the Forest
Kingdom, Milestone 2.4). Work top-to-bottom; each numbered section is roughly one
focused session with green gates + a headless smoke. Front-load the *systems*
steps (new mechanics), then the *content* steps are mostly JSON and cheap.

**Guiding rule (from CLAUDE.md):** all content lives in `data/*.json`, validated
by zod. Adding a map, enemy, quest, NPC, faction, recipe, or secret must **never**
require code changes — only genuinely new *mechanics* touch `src/`.

---

## 0. Plan the zone
- Name it, pick its theme, and decide its shape: overworld/wilds map, a town, a
  dungeon, a mini-boss, a world boss, a faction, a quest chain, secrets.
- Decide up front which steps need **new systems** (new enemy patterns, a new
  reward type, a new mechanic) vs. pure **content** (reuses existing engines).
  Build the systems first — content that depends on them comes cheap after.

## 1. Tiles (only if the zone needs new-looking terrain)
`src/systems/mapgen.ts` (`TILE`), `src/systems/pixelart.ts` (`TILE_COUNT` +
`addTilesetTexture`), and `scripts/generate-maps.mjs` (`TILE`, `TILE_COUNT`,
`SOLID`) must **stay in sync** — `TILE_COUNT` lives in all three.
- Add the new tile ids to `TILE` (mapgen + generate-maps).
- Bump `TILE_COUNT` (pixelart + generate-maps) and draw each new tile in
  `addTilesetTexture` (1 char = 1px; the strip is `TILE_COUNT * 16` wide).
- Add solid tiles to `SOLID` in generate-maps (solidity comes from the tileset's
  per-tile `solid` property, which the map loader reads). *Walkable* tiles that
  look solid (secret false walls) simply stay out of `SOLID`.

## 2. Maps
`scripts/generate-maps.mjs` is the source-of-truth generator (deterministic,
seeded). For each map:
- Write a `genX(rnd)` returning a `grid` (rows of `TILE` ids). `tiledMap` derives
  width/height from the grid, so any size is fine (~3× the plains is a good wilds
  size).
- Add a `tiledMap({ grid, spawnObjects, triggerObjects })` and a `writeFileSync`.
- `spawnObjects`: a `player_spawn` (required), plus `enemy_region` (open wilds —
  scatters from the zone's `enemyTypes`) or `enemy_spawn` points (fixed, with a
  `pool`). Optionally a `world_boss` (pool/respawn/announce).
- `triggerObjects`: `transition`s (target/targetX/targetY) to neighbouring maps,
  `heal` zones, `secret`s (secretId/lore/gold/optional relic).
- **Wire both directions**: a gate *into* the zone from a neighbour, and a gate
  back. Land the player on a **walkable** tile both ways (assert this in tests).
- Run `node scripts/generate-maps.mjs`. Note: this rewrites *all* maps (the shared
  tileset block), but ground layouts of untouched maps stay byte-identical.

## 3. Register the zone
- `data/zones.json`: `{ id, name, dark, enemyTypes: [...] }` (enemyTypes must be
  real enemy ids; `dark: true` enables heavy fog for dungeons).
- `src/scenes/BootScene.ts`: add the id to `MAP_ZONES`.
- Update the zone-list assertion in `src/data/loader.test.ts`.

## 4. Enemies
`data/enemies.json` — each is data-only unless it needs a *new attack pattern*.
Existing patterns (all optional schema fields): `slam`, `charge`, `ranged`
(+`keepDistance` to kite), `explode`, `summon`. A boss is `boss: true` (+`name`);
it can drop a one-time relic via `relic`/`relicName`.
- A genuinely new behaviour is a *systems* change: add the schema field
  (`src/data/schemas/enemy.ts`), implement it in `src/entities/Enemy.ts`, and add
  a pure helper + test where possible (see `src/systems/enemyAI.ts`).
- Give each new enemy a sprite in `pixelart.ts` (`SPRITE_ROW_SETS`), or it falls
  back to a magenta blob.

## 5. Town & services (if the zone has one)
- A town map (`genX` town, walkable floor, building facades, a heal `well`, gates).
- Place service NPCs in `data/npcs.json` with `service: vendor|blacksmith|stash`
  (they route straight to the shared UIs) or a dialogue trainer using the `respec`
  action. Service NPCs reuse the generic dialogue trees; only bespoke NPCs need
  new trees. All service UIs + vendor stock are global, so a new town "just works".

## 6. Faction & reputation (optional)
`data/factions.json`: `{ id, name, zones, killRep, bossRep, tiers[] }` (each tier
`{ name, threshold, vendorBonus }`). Rep is a save field (`reputation`), awarded
on kills in the faction's zones and on quests with `rewards.faction`+`rep`. A
vendor NPC with a `faction` re-rolls its stock to `8 + tier.vendorBonus` and shows
a standing line. Pure logic + tests in `src/systems/factions.ts`.

## 7. Quest chain (the zone story)
Pure content — reuses the m2.1/2.2 quest + dialogue engines.
- `data/quests.json`: NPC-given quests (`autoOffer: false`), each gated behind the
  last via `prerequisites`, sharing a `chain` id. Objectives target real enemy /
  zone / npc ids. Rewards can grant faction `rep`.
- `data/npcs.json`: quest-givers with `offersQuests` (drives the `!`/`?` markers).
- `data/dialogue.json`: a tree per giver; gate `accept` choices by
  `questAvailable`, in-progress lines by `questActive`, thanks by `questCompleted`;
  the accept choice fires `action.startsQuest`.
- The content-graph test (`loader.test.ts`) validates every id reference resolves.

## 8. Secrets (optional)
- False-wall tiles (`FALSEPINE`/`FALSEWALL`): drawn like a solid tile but omitted
  from `SOLID`, so the player pushes through. Carve a walled pocket with one false
  tile as its entrance.
- A `secret` trigger (secretId/lore/gold/optional relic) records to the `secrets`
  save field once and toasts on discovery. Optionally seal an *optional boss* in
  the pocket.

## 9. Verify & finish (every step)
- **Gates**: `npm run typecheck && npm run lint && npm run test && npm run build`
  — all clean before ticking a box.
- **Smoke**: boot the built app headless (Playwright + the `__AZER` debug handle),
  drive the feature, assert state. See any prior `smoke-*.mjs` pattern in the git
  history and the `__AZER.debug` tools.
- **Save migrations**: any new save field is *additive* + gets a one-line
  migration in `src/systems/save/migrations.ts` (bump `CURRENT_SAVE_VERSION`) and a
  migration test. Zone 2 churned the save v8→v12 this way, painlessly.
- Tick the ROADMAP box, update `CHANGELOG.md` (player-facing) + `PROGRESS.md`, add
  anything needing human eyes to `## Needs human playtest`, and commit.

## Cost calibration (from Zone 2)
~8 feature boxes per zone. **Content boxes** (map, town, quest chain) are cheap —
mostly JSON. **Systems boxes** (new enemy patterns, dungeon reward, world boss,
faction, secrets) cost ≈2× — new code + schema + a save migration + new tests.
Budget accordingly and build the systems first.
