# Progress — Ashes of Azer

## Current task
**MILESTONE 2.4 IN PROGRESS** — 4 of 9 boxes done (Tileset+map; Town; new enemy
types; **Dungeon + mini-boss + relic**). **Next box (top-to-bottom): "World boss
(open-world, respawns, announced spawn)"** — a big open-world boss in the Reach
that respawns on a timer and announces its spawn (a banner/toast). New engine
work: a respawn scheduler + spawn announcement; the boss itself can reuse the
boss/slam/summon patterns. Decide where it spawns (a fixed arena in the forest
map) and its respawn cadence. Then: faction/rep track, 8–12 quest chain, 2–3
secrets, *write down the hours*. Still open from earlier: 1.6 class sprite sheets
(art) and 2.1 objective markers (minimap). Milestone 2 finishes when a new player
can play Starter Plains → Forest Kingdom carried by quests.

Relic system note: relics are a save field (`relics: string[]`, v10) awarded by an
enemy's `relic`/`relicName` fields on death (one-time, in onEnemyDied). There's no
relic UI or effect yet — they're collected + toasted + persisted. A future box can
give relics meaning (a collection screen, set bonuses, or gating). The world boss
(next) is a natural second relic source.

Notes for the remaining 2.4 boxes:
- 2.4 is a *production* milestone — most boxes reuse existing systems
  (data-driven enemies/zones/quests/NPCs/dialogue/loot/crafting). Genuinely NEW
  engine work still ahead: **faction/reputation track** (new save field + vendor
  unlock gates + a v10 migration), **world boss** (open-world respawn timer +
  announced spawn). Each remaining box is roughly one session.
- **Forest town + dungeon**: the Verdant Reach map (`genForest`) has open glades
  and a main path but no town/dungeon gates yet (only the west return-to-plains
  gate) — I deliberately did NOT add transitions to maps that don't exist. When
  building the forest town/dungeon, add their maps first, then wire the gates
  into `genForest` (carve a DOOR + a transition trigger) and regenerate.
- **Map/tileset pipeline** (established this box): `scripts/generate-maps.mjs` now
  derives each map's width/height from its grid (any size), and the shared
  tileset is TILE_COUNT=12 tiles (added FOREST/PINE/MUSHROOM). To add a zone:
  write a `genX(rnd)`, add a `tiledMap({grid, spawnObjects, triggerObjects})` +
  `writeFileSync`, add the id to `BootScene.MAP_ZONES` + `data/zones.json`, and a
  transition from a neighbouring map. `TILE` lives in 3 places that must stay in
  sync: mapgen.ts (runtime), pixelart.ts (TILE_COUNT + drawing), generate-maps.mjs.
- Regenerating maps rewrites ALL of assets/maps/*.json (the tileset block widened
  to 12 tiles everywhere) — that's expected; ground layouts are unchanged.
- `assets/maps/tiles.png` is legacy/unused at runtime (the tileset is drawn
  procedurally by `addTilesetTexture`); BootScene never loads it. Left as-is.
- The three+ item UIs (Inventory/Shop/Stash) + RepairUI duplicate a tooltip +
  `RARITY_HEX` palette — extract a shared `itemTooltip(item, affixes)` +
  RARITY_HEX helper (backlog) before the Forest town adds more item UI.
- Content graph is now integrity-tested (loader.test.ts): quest prereqs, kill/
  reach targets, NPC dialogue+offersQuests links, and every dialogue
  nextNodeId/startsQuest/quest-condition must resolve. New content that dangles a
  reference fails the test — a safety net for 2.4's larger content load.
- Service NPCs: `NpcSchema.service` ('vendor'|'blacksmith'|'stash'|'trainer');
  `tryTalk` opens the matching UI (vendor + stash + blacksmith wired; trainer is
  a dialogue NPC using the `respec` action, not a service UI).
- ⚠️ **Build-cache gotcha:** `npm run build` can serve a STALE bundle from
  Vite's cache. If a smoke contradicts a passing unit test, `rm -rf
  node_modules/.vite` (and `dist`) then rebuild. Build in the FOREGROUND then
  start `npm run preview` separately — chaining `build && preview` in one
  backgrounded command failed here.

## Done
- **Milestone 2.4 Dungeon + mini-boss + relic (4th box): the Bramblewarren**
  (headless-verified 9/9; 183 unit tests):
  - **`genForestDungeon` map** (60×40, dark): DWALL barrow carved into DFLOOR
    rooms + corridors with mossy patches, a mini-boss chamber, and an exit portal.
    Reached via a **cave mouth** carved into the east end of the Reach's path
    (barrow-gate → forestdungeon; exit-portal → forest). zones.json
    (Bramblewarren, dark:true), BootScene.MAP_ZONES. Enemy spawn points seed the
    new forest foes; a dedicated point spawns the mini-boss.
  - **Mini-boss Mossmaw** (data/enemies.json, boss:true): reuses slam + summon
    (calls sporelings), 300 hp, its own name banner.
  - **Relic fragments** (save v10): `relics: string[]` (v9→v10 migration → []).
    An enemy's optional `relic`/`relicName` fields grant a one-time collectible in
    `onEnemyDied` (dedup via includes, toast, saved). Mossmaw drops the Verdant
    Heart. No relic UI/effect yet (collected + persisted only).
  - Verified in-browser: barrow gate in, mini-boss present, bleed-kill awards the
    relic once (recorded as a defeated boss), portal out, relic persists. Map +
    content + migration tests guard the wiring / v10 / mini-boss-grants-relic.
- **Milestone 2.4 new enemy types (3rd box): 4 distinct attack patterns**
  (headless-verified 9/9; 179 unit tests). The Reach's roster, each a genuinely
  different fight — all data-driven via optional `EnemySchema` configs:
  - **Attack-pattern engine** (Enemy.ts): `charge` (telegraph → locked dash,
    contact once), `ranged` (fire a projectile at the player from range),
    `explode` (rush → windup ring → self-destruct AoE), `summon` (call minions,
    scene enforces the `max` + a hard cap). `keepDistance` adds a kite movement
    mode. Pure movement decision extracted to `src/systems/enemyAI.ts` (`moveMode`
    / `abilityReady`, unit-tested). New `EnemyProjectilePool` (mirror of the
    player's pool — straight shots that damage the player). Enemy emits
    `enemy-shoot` / `enemy-summon` events; WorldScene owns the pool + summon
    spawner (mirrors the existing `enemy-died` wiring).
  - **4 enemy types** (data/enemies.json + forest zone enemyTypes): thornwolf
    (charge), sporeling (explode), spitter (ranged + keepDistance), grovewarden
    (summon sporelings). Each has its own procedural sprite (pixelart.ts).
  - Content test now checks summon-minion ids resolve. `__AZER.spawn(id,x,y)`
    added to the debug handle (test infra + future m2.5 debug tools); `counts()`
    now reports enemyShots + live enemy count. Exploders/chargers skip the normal
    contact attack (their dash/detonation is their attack); ring telegraph
    extracted to `Enemy.spawnRing`.
- **Milestone 2.4 Town with all services (2nd box): Thornhollow** (headless-
  verified 7/7; 174 unit tests). The Forest Kingdom's town, reusing every m2.3
  service system with zero new code — proof the town/service architecture is
  reusable:
  - **`genForestTown` map** (60×40, forest floor + pines, seed 7777): four
    service buildings (facade + door), a cross of paths, a healing well, a gate
    back to the Reach. Reached via a **north spur** carved into `genForest`'s main
    path (DOOR at forest tile 36,3 → foresttown; town's south gate 29,37 → forest).
  - **Wired**: `data/zones.json` (Thornhollow, no enemies), `BootScene.MAP_ZONES`.
  - **4 service NPCs** (data-only, `data/npcs.json`): Trader Fennwick (vendor),
    Smith Garrow (blacksmith), Keeper Wren (stash) — all reuse the existing
    generic dialogue trees since service NPCs route straight to their UI — and
    Warden-Master Sylva, a dialogue trainer with a new `foresttrainer` respec
    tree (no Ashfall trial; class-quest variants come with the 2.4 quest chain).
  - Service UIs (shop/stash/repair) + `vendorStock` are per-load / global, so a
    second town's services worked untouched. Verified in-browser: north gate in,
    all four panels open (shop/repair/stash/dialogue), respec choice present,
    south gate back to the Reach. Map + content tests guard the wiring + that
    foresttown offers vendor+blacksmith+stash and a respec trainer.
- **Milestone 2.4 Tileset + map (1st box): the Verdant Reach** (headless-verified
  8/8; 170 unit tests). The Forest Kingdom's wilds — a distinct zone reachable
  from the plains:
  - **New forest tiles** on the shared procedural tileset (pixelart.ts,
    TILE_COUNT 9→12): `FOREST` (dark mossy floor), `PINE` (solid conifer),
    `MUSHROOM` (decor). TILE enum extended in mapgen.ts to match.
  - **`genForest` map** (`scripts/generate-maps.mjs`): 100×72 = 7200 tiles =
    exactly 3× the 60×40 plains. Dark forest floor, dense pines, 4 grass glades,
    a woodland pond, a winding 2-wide main path, a west entry pocket. Seeded
    (mulberry32(9001)), deterministic. `tiledMap` now derives width/height from
    the grid so a zone can be any size.
  - **Wired into the world**: `data/zones.json` (Verdant Reach, enemyTypes
    slime/bat/skel), `BootScene.MAP_ZONES`, an **east gate** carved into the
    overworld path (→ forest) and a **west gate** back (→ plains). A single
    `enemy_region` scatters 30 foes (respawnCap 22), like the plains.
  - **Verified in-browser**: transition both ways works, 30 enemies spawn, the
    player lands walkable and moves freely, and it holds **~61 fps** on the 3×
    map (perf target intact). `src/systems/maps.test.ts` guards map size, layers,
    tileset count, walkable spawn/landing tiles, and the plains↔forest gate wiring.
  - Content-integrity test now also checks every zone's `enemyTypes` resolves.
- **Milestone 2.3 quest-NPC chain (6th box → milestone content complete)**
  (headless-verified 9/9; 166 unit tests). The **Ashfall** chain: 5 NPC-given
  quests, each gated behind the previous, each from a different townsperson who
  points you to the next:
  - Wellkeeper Sena → `q_ash_greywater` (kill 5 slime) → Warden Kessa →
    `q_ash_watch` (kill 6 bat) → Scout Doran → `q_ash_lostscout` (reach dungeon)
    → Herbalist Mira → `q_ash_barrowroots` (kill 8 skel) → Priest Halden →
    `q_ash_cleanse` (kill boss). All `chain:"ashfall"`, all `autoOffer:false`.
  - Pure content: 5 NPCs (npcs.json), 5 dialogue trees (dialogue.json, each with
    greet/lore/accept/inprogress/thanks nodes gated by questAvailable/Active/
    Completed conditions), 5 quests (quests.json). No new systems — reuses the
    m2.1/2.2 quest+dialogue engines. NPCs placed on walkable town coords
    (verified in-browser: all spawn, all open dialogue on E, accepts start the
    right quest, prereq gating hides accept choices until unlocked).
  - **Content-integrity tests** added to loader.test.ts (guards the whole
    quest/dialogue/NPC reference graph + asserts the ashfall chain shape).
- **Milestone 2.3 Blacksmith (5th box): repair + crafting** (headless-verified
  17/17; 164 unit tests):
  - **Repair (save v8)**: items roll with `durability`/`maxDurability` (sturdier
    when better/higher base). Gear wears a point every couple of swings
    (`wearGear`); a broken item (durability 0) contributes **no stats** until
    fixed (`gearStats` skips `isBroken`). **Smith Bralla** (`service:'blacksmith'`)
    opens the blacksmith panel: pay gold (1g per missing point) to restore an
    item — per-item click or **Repair All**. `repairCost`/`isBroken`/`durabilityFor`
    in `loot.ts`; `RepairUI.ts`.
  - **Crafting (save v9)**: `data/recipes.json` (new `RecipesFileSchema`) holds
    **materials** (id/name/color/weight) and **recipes** (inputs: material→count,
    gold, result: slot+rarity). Enemies drop materials
    (`MATERIAL_DROP_CHANCE 0.3`, weighted `pickMaterial`) as a small colored chip
    you walk over → banked into `saveData.materials` (v8→v9 migration → `{}`).
    The blacksmith panel's **CRAFT** section shows your material stock + each
    recipe (greyed when you can't afford it); forging spends materials + gold and
    drops a rolled item of the recipe's slot/rarity into your bag. Pure logic in
    `src/systems/crafting.ts` (`canCraft`/`spendInputs`/`craftItem`/`pickMaterial`,
    6 tests); `rollItem` gained an `opts.rarity` to force a rarity (1 test).
  - Everything data-driven: adding a material or recipe is JSON-only. 3 starter
    recipes (fine weapon / warplate / ember ring), 4 materials.
- **Milestone 2.3 (4/6 boxes): town + Vendor + Stash + Trainer** (headless-
  verified: town+vendor 10/10, stash+trainer 7/7; 153 unit tests):
  - **Stash** (save **v7**): a `stash: ItemInstance[]` array (v6→v7 migration).
    **StashUI** (`src/ui/StashUI.ts`) moves items bag↔stash; **Stashkeeper Odd**
    (`service: 'stash'`) opens it.
  - **Trainer** (`Master Vane`, dialogue NPC): a new `respec` **dialogue action**
    resets skill points + passive slots (shared `doRespec()` with the K-panel
    button); a `startsQuest` choice gives **The Trainer's Trial** (kill 10
    skeletons, `autoOffer:false`). Per-class quest variants are future content.
  - (below) — the town + the Vendor:
  - **Ashfall Village** (`town` zone): `genTown()` added to
    `scripts/generate-maps.mjs` (regeneratable) → grass + a path plaza, 6
    building facades (solid stone with a door), a healing well; a **town gate**
    on the overworld (west of the path) transitions in, a **plains gate**
    transitions back. Registered in zones.json (`enemyTypes: []`, safe) +
    BootScene's MAP_ZONES. No enemies spawn (no spawn objects/regions).
  - **Vendor** (`Merchant Pell`, `service: 'vendor'`): E opens **ShopUI**
    (`src/ui/ShopUI.ts`) — buy from a rolled stock (`rollVendorStock`), sell
    from the bag, against `player.gold`. Pricing: `itemValue` (base + affixes,
    ×rarity) and `sellValue` (40%). Stock is in-memory, re-rolled on zone load
    and on level-up. Added `NpcSchema.service`; `tryTalk` routes service NPCs
    to their UI (and still fires a `talkTo`); shop/dialogue both freeze the
    player. A merchant sprite added to pixelart.
- **Milestone 1.7 COMPLETE: loot & inventory (the loot loop)** — added scope
  (no roadmap box existed; the town + the core pillar needed it). Headless-
  verified 10/10, 151 unit tests.
  - **Pure loot engine** (`src/systems/loot.ts`, 16 tests, injected RNG):
    `rollItem(items, affixes, rng)` rolls rarity (weighted by dropChance) →
    base for the slot → `affixCount` distinct affixes (flag affixes = 1, else
    min..max); a legendary rarity for a slot with a legendary yields it (forced
    affixes + power, best base). `gearStats(gear)` sums equipped bases (Weapon
    base = flat damage, other slots = life×3) + affixes into derived stats.
  - **Drops**: enemies roll a drop on death (`NORMAL_DROP_CHANCE` 0.4, bosses
    guaranteed) → a rarity-colored bobbing gem on the ground; the player walks
    within `PICKUP_RANGE` to bank it into `saveData.bag` (toast in the rarity
    colour).
  - **Gear → stats**: `recomputeStats` folds `gearStats` into maxHp/crit/aspd/
    move/cdr/lifesteal/manaOnKill/vision; `effectiveDamage` adds the weapon's
    flat damage. Equipping a legendary re-runs `computeEffectiveSkills` +
    `collectItemHooks` + rebuilds the hotbar, so item-modifies-skill now
    triggers from real drops (not just save-edits).
  - **InventoryUI** (`src/ui/InventoryUI.ts`, DOM, toggled **I**): equipment
    slots + bag grid; click to equip (swaps the old item back to the bag) or
    unequip; hover = a rarity-colored tooltip rendering each affix via its
    `labelTemplate`. `__AZER.counts()` now also reports `drops`/`bag`.
- **Milestone 2.2 COMPLETE: NPC & dialogue system** (headless-verified 10/10,
  143 unit tests):
  - **Schemas**: `NpcSchema` (data-placed: zone + x/y, sprite, dialogue tree,
    wander, offersQuests) and an enriched `DialogueSchema` — choices carry a
    `condition` (flag/notFlag/questActive/questCompleted/questAvailable/
    corruption range) and an `action` (setsFlag/startsQuest). Added
    `quest.autoOffer` (false = NPC-given only). Registered `npcs.json` through
    the loader/gameData.
  - **Pure dialogue engine** (`src/systems/dialogue.ts`, 10 tests):
    `evalCondition`, `visibleChoices`, `nodeById`, and `questMarker` (the ! / ?
    over an NPC). `startAvailable` now skips `autoOffer:false` quests so they
    only start via a dialogue action.
  - **Npc entity** (`src/entities/Npc.ts`): procedural elder sprite, name tag,
    optional idle wander (steers home when it strays), a "▲ Talk (E)" prompt
    when the player is close, and a live ! / ? marker. Collides with the player.
  - **DialogueUI** (`src/ui/DialogueUI.ts`, DOM): portrait (the NPC's sprite
    rendered to a data-URL), a typewriter **text crawl** (click text to skip),
    and condition-gated **choice buttons**.
  - **WorldScene wiring**: E near an NPC opens their tree; talking fires
    `questEvent('talkTo', npcId)`; a choice's action sets flags / starts an
    NPC-given quest; player movement + attacks freeze during a conversation.
  - **Content**: Elder Maru (overworld) + his dialogue tree + two quests —
    `q_meet_elder` (talkTo, auto-offered) and `q_elder_hunt` (kill 6 bats,
    NPC-given via the Accept choice).
- **Milestone 2.1 (4/5 boxes): quest system** (headless-verified 14/14, 132
  unit tests):
  - **Schema** (`quest.ts`): objectives (`kill`/`collect`/`talkTo`/`reach` +
    target + count), rewards (xp/gold/itemIds), prerequisites, chain id — was
    stubbed in 0.3, now real content.
  - **Pure engine** (`src/systems/quests.ts`, immutable, 11 tests):
    `availableQuests` (prereq-gated), `startQuest`/`startAvailable` (auto-pins
    the first), `recordEvent` (advances matching objectives, caps at count,
    auto-completes + reports finished quests), `completeQuest`. Returns the same
    state reference when nothing changed, so callers can skip a save.
  - **Save v6**: `QuestState {active, completed, progress, tracked}` in the
    save with a v5→v6 migration (older saves get an empty log). This is the
    "quest flags integrate with the save" box.
  - **WorldScene wiring**: auto-offers available quests on entry, fires
    `questEvent('kill', enemyId)` on death and `questEvent('reach', zoneId)` on
    zone entry; completion grants xp (via the new shared `gainXp` helper) + gold
    and unlocks the next quest in the chain.
  - **QuestUI** (`src/ui/QuestUI.ts`, DOM): an always-on **tracker** (top-right)
    for the pinned quest's objectives with live counts, and a **journal** panel
    toggled with **J** (Active + Completed; click a quest to pin it).
  - **3 starter quests** (`quests.json`): Cull the Slimes (kill 5) → Into the
    Barrow (reach dungeon) → Slay Rotfang (kill 4 skel + 1 boss).
- **Milestone 1.6 (5/6 boxes): combat feel pass** (all headless-verified 7/7,
  121 unit tests still green):
  - **Procedural motion** (no art dep): `Player`/`Enemy` do a walk squash-bob
    while moving (scale-only, so the physics body is untouched) and the hero
    does a short attack **lunge** on each swing.
  - **Enemy attack telegraphs**: a contact hit now has a ~0.28s **windup** —
    the enemy braces (stops) and flashes yellow, then strikes only if you're
    still in reach; the boss **slam** shows its ring for ~0.4s *before* the blow
    lands (dodgeable). New `windupT`/`slamPendingT` timers in `Enemy`.
  - **Hit-stop + shake + knockback**: a **crit** triggers ~0.05s of hit-stop
    (WorldScene.update early-returns while `hitStopT>0`; tweens keep playing so
    the number still pops) plus a small `cameras.main.shake`; every player hit
    **knocks the enemy back** (`Enemy.knockback` sets an away-from-player
    impulse that a `knockT` window lets carry before the AI resumes).
  - **Corpse fade**: `Enemy.die` now goes **inactive** (so all `active`-gated
    combat/targeting ignores it — with a re-entry guard so a kill is never
    awarded twice), then splat-fades (alpha→0, scaleX↑/scaleY↓) over 260ms
    before destroying, instead of vanishing instantly.
  - **Damage number pass** (`DamageNumbers.spawn(..., kind)`): `crit` pops in
    big/gold with a Back-ease scale punch, `dot` ticks are small and quick,
    `player` damage reads in aggressive red (#f0463c). Callers updated in
    `Enemy.takeHit`/`tickDoT` and `Player.takeDamage`.
- **Milestone 1.5 COMPLETE: item-modifies-skill system (the design's heart).**
  Items change how skills *behave*, not just their numbers — fully data-driven
  (no code per legendary), headless-verified 9/9.
  - **skillMod resolver** (`src/systems/skillMods.ts`, pure, 12 tests):
    `applySkillMods(skill, mods)` folds mods onto a skill — adds to existing
    RankScaling `.base`/number/bool fields, or *creates* absent ones from a
    `CREATABLE` whitelist (so a mod can grant chaining/returning/splitting a
    skill never had). `equippedSkillMods`/`equippedLegendaries` resolve gear via
    each ItemInstance's `power` key.
  - **Data model** (`item.ts`): `SkillModSchema {skill, mod, value, op}` and
    `ItemHookSchema {on, effect, value, radius?, duration?, element?}` on
    `LegendarySchema.skillMods[]` / `.hooks[]` (both default `[]`, so the 3 old
    legendaries stay valid).
  - **Projectile `returns`** (boomerang): reverses once at end of range,
    clearing hits so it can strike again on the way back — the last link of the
    Fireball chain.
  - **Effective skills**: WorldScene computes `effectiveSkills =
    applySkillModsAll(classSkills, equippedSkillMods(gear, legendaries))`; the
    hotbar and the K-panel tooltips read these (learning/ranking still key off
    base `classSkills`). So a modded Fireball *casts* split/chain/return AND its
    tooltip shows it.
  - **Triggered hooks** (`onCast`/`onHit`/`onKill`) dispatched generically via
    `runHooks` with effects `explode`/`burn`/`chill`/`heal`/`manaGain`; an
    `inHook` flag stops an effect's own damage from cascading. Enemy death now
    emits its position so `onKill explode` lands where the enemy fell.
  - **8 legendaries** (≥2 skill-modifying per class): Emberfall (the canonical
    Fireball split→chain→burn→return), Glacial Crown, Colossus Plate,
    Executioner's Edge, Beastmaster Totem, Snarelord Boots, Frostheart (onKill
    explode), Bloodmyre (onHit burn).
  - **Bug fixed along the way**: an AoE damage loop iterating the live enemy
    group skipped the next target when `dealDamage` destroyed the dying enemy
    mid-iteration — now snapshots in-range targets first. (Applies to the
    explode hook; the pattern is worth watching in other AoE loops.)
  - Items don't *drop* yet (loot is a later milestone); tests equip legendaries
    through the save's `gear` (schema already supports it). 121 unit tests.
- **Milestone 1.4 COMPLETE: Hunter class.** Three new mechanics + kit, all
  data-driven and headless-verified (11/11 smoke checks):
  - **Multi Shot** — added `count` + `spreadArc` to the `projectile` mechanic;
    the cast fires a fan via the existing `fanAngles()` (count 1 = a plain
    bolt, so Mage/Warrior projectiles are unaffected).
  - **Trap system** (`src/entities/Trap.ts`, small managed list): placed at the
    player's feet, arms after `armTime`, then detonates the instant an enemy
    enters its radius — AoE damage + element/stun to everything in the blast —
    or fizzles after `lifetime`. New `trap` mechanic (Snare/Explosive/Frost).
  - **Pet AI** (`src/entities/Pet.ts`): a companion sprite that heels to the
    player, runs down the nearest enemy within leash of the player and bites it
    (damage resolved through a hook so it tracks player buffs), takes contact
    damage from adjacent enemies, and dies → respawns at the player after
    `respawnTime`. New `summon` mechanic; re-casting heals/recalls it. One pet
    per player; colliders with the map; destroyed on zone change. Enemy AI is
    untouched (enemies still target the player; the pet takes damage only when
    an enemy is already adjacent).
  - **Rapid Fire** — added a transient `aspdBuffPct` (+timer) to Player and an
    optional `attackSpeedPct` to the `buff` mechanic; basic-attack cooldown now
    uses `aspdPct + aspdBuffPct`.
  - **Hunter kit** in skills.json: 14 actives (Quick Shot, Multi Shot, Piercing
    Arrow, Chain Shot, Arrow Storm, Point Blank generator, Summon Wolf, Rapid
    Fire, Snare/Explosive/Frost traps, Disengage, Hunter's Mark, Volley) + 10
    passives, all `class: "hunter"`. **Hunter flipped to playable** in the
    class picker.
  - Debug: `__AZER.counts()` now returns `{projectiles, traps, pet}` for
    headless smoke tests (and the m2.5 debug tools). 109 unit tests.
- **Title / main menu (m5.2 pulled forward, at the user's request).**
  `src/scenes/TitleScene.ts` (DOM overlay): BootScene now always opens the
  Title. **Continue** loads the slot-1 save (shows its class + level and starts
  the World); **New Game** opens the class picker. Reason it was needed *now*:
  the m1.3 class-select only appeared on an empty slot 1, so a player with an
  existing Warrior save could never reach the Mage. ClassSelectScene gained a
  **← Back** button (→ Title) and an **overwrite guard** — when a save already
  exists, the first click on a class asks to confirm ("click again"), the
  second commits (single save slot, so New Game replaces it). Headless-verified
  12/12: fresh boot shows only New Game; New Game→Back→Title; picking Mage on an
  empty slot starts immediately; an existing save shows Continue with the right
  class/level and Continue preserves it; the two-click overwrite guard works.
  Multi-slot save management is still deferred to the proper m5.2 UI pass.
- **Milestone 1.3 COMPLETE: Mage class.** New engine systems, both pooled per
  the CLAUDE.md perf rule:
  - **Projectile system** (`src/entities/Projectile.ts` 128-slot pool +
    `src/systems/projectiles.ts` pure `fanAngles`/`nearestTarget`): speed,
    hit radius, lifetime, pierce (pass-through count), chain (jump to nearest
    unhit target within range), split (fan of extra bolts on first hit at 0.6x
    dmg), elements. Fires toward the mouse cursor via `aimDir()`.
  - **Ground-effect system** (`src/entities/GroundEffect.ts`, small managed
    list): telegraph delay + impact burst (Meteor), ticks dps/2 every 0.5s to
    enemies inside, applies chill/burn. Placed 60px toward the cursor.
  - **Elements (light model, no resistances):** fire → burn DoT (orange, its
    own channel independent of bleed), frost → chill (movement slow). Added to
    `Enemy` as `burn`/`chill` state with `applyBurn`/`applyChill`; stable `eid`
    for projectile hit-tracking.
  - **Class system:** skills tagged `class` (`ClassSchema`, default warrior so
    pre-1.3 content/saves need no change); save v5 adds `character.class` (+
    v4→v5 migration → warrior). WorldScene threads `this.classSkills =
    skillsForClass(...)` through the hotbar, skill panel, learning, passives,
    and default bar — a Mage never sees Warrior skills and vice-versa. The
    seeded default bar now persists immediately (was only saved on autosave).
  - **Class-select screen** (`src/scenes/ClassSelectScene.ts`, DOM overlay per
    CLAUDE.md): BootScene routes new games (empty slot 1) here; Warrior/Mage
    cards playable, Hunter "coming soon". Existing/corrupt saves skip straight
    to the World.
  - **Mage kit** in skills.json: 14 actives (Arcane Bolt/Fireball/Ice Shard/
    Chain Lightning/Pyroblast projectiles; Flame Wall/Blizzard/Meteor ground;
    Arcane Pulse generator; Frost Nova; Blink; Mana Shield; Hex; Rejuvenate) +
    10 passives, all `class: "mage"`. Unlocks L1–L10.
  - Headless-verified (14/14 smoke checks): class-select shows all 3 cards +
    Hunter disabled; picking Mage writes a mage save with an Arcane-Bolt-led
    bar and no Warrior skills; Arcane Bolt damages a foe; Fireball burns; Ice
    Shard chills; an existing Warrior save skips select and keeps its kit.
    105 unit tests (added mage-kit content + v4→v5 migration coverage).
- **Milestone 1.2 COMPLETE: Warrior kit (14 actives / 10 passives).** Mana +
  generators resource model (user-approved). New engine mechanics with
  tests: generator (mana-refund primary), charge (corridor dash+stun),
  shockwave bleed DoT, debuff/vulnerability, heal, buff damage-reduction.
  Conditional passives via engine hooks (lifesteal/thorns/block/manaOnKill/
  dmg-vs-stunned/berserk/cdr) all summing through passiveModifiers; combat
  centralised on one dealDamage() path. Content in skills.json unlocking
  L1-L10. Headless-verified all 5 representative new mechanics. 95 tests.
  Whirlwind-pulls deferred to m1.5.
- **Milestone 1.1 COMPLETE: passive slots UI + respec.** Purple pslot row
  (bottom-right): auto-slot on learn, drag between slots, drag-off to
  unslot, panel-to-slot drag; RESPEC button clears skillRanks + passive
  slots and refunds points. Headless-verified the full 126/120 hp cycle
  + point refund. 91 tests.
- **Milestone 1.1: passive skill type (save v4).** Schema 'passive' union
  variant + 3 content passives; passiveModifiers (slotted+learned only) →
  WorldScene.recomputeStats (level base × modifiers, hp fraction kept);
  auto-slot on learn; blocked from active hotbar. Headless-verified 126 =
  120×1.05 + reload persistence. 91 tests.
- **Milestone 1.1 sub-box 3: drag-and-drop loadout (save v3).** Pure
  helpers defaultActives/resolveLoadout/assignSlot (swap semantics) in
  skills.ts; SkillUI mouse-drag with ghost + drop highlight; setSlot host
  callback; save v3 loadout.actives + v2→v3 migration. Headless-verified
  drag swap + reload persistence. 87 tests.
- **Milestone 1.1 sub-box 2: skill panel UI + hotbar (first DOM overlay).**
  `src/ui/SkillUI.ts` (hotbar with live cooldown/mana/locked states via
  castBlock; K panel with pips, per-rank descriptions from describeSkill,
  + buttons spending derived points via WorldScene.rankUpSkill → autosave).
  Destroyed/rebuilt across zone transitions via scene shutdown event.
  Verified headless incl. learning Execute through a real DOM click and the
  rank surviving reload. Screenshot eyeballed — prototype panel look.
- **Milestone 1.1 sub-box 1: skill execution engine + XP/leveling.**
  - `src/systems/skills.ts` (pure, tested): xpToNext 40×1.5-rounded chain,
    applyXp with multi-level carry, scaleValue, skillCooldown (60% CDR cap),
    manaMaxFor, rankOf (save skillRanks ?? data startingRank),
    availableSkillPoints (derived: level-1 minus ranks bought beyond free
    starting ranks — never stored), castBlock reasons.
  - Keys 1-5 cast the five warrior skills from skills.json (schema gained
    `startingRank` + `fxColor`): shockwave AoE+stun (enemies have a stun
    state halting move/attack/slam), leap dash+landing AoE, execute with
    low-hp threshold + mana refund on no target, War Cry damage buff
    (applies to basic attacks AND skills via effectiveDamage()).
  - Mana pool + 4/s regen; enemy deaths grant JSON xp → prototype level-up
    (full heal/mana, +10 hp/+5 mp per level) with autosave; killedBosses
    recorded on boss deaths. HUD: mana bar, XP bar, level text.
  - Verified headless with prototype-exact numbers (slam 13 dmg = 10×1.3,
    mana 18, stun freeze, leap 110px, unlearned block, 43xp→lvl2 rem 3).
    84 unit tests.
- **Milestone 0.5 is COMPLETE — all 4 checkboxes ticked. Milestone 0 done.**
  - Maps are authored Tiled JSON in `assets/maps/` (conventions documented
    in `assets/maps/README.md`; layouts frozen from the prototype's
    generators by `scripts/generate-maps.mjs`, hand-editable in Tiled;
    `tiles.png` exported from the exact runtime texture so Tiled shows the
    real art). Vite `publicDir` is now `/assets`.
  - WorldScene is zone-parameterized (`scene.restart({zone, entryX/Y})`),
    builds everything from the map: collision from per-tile `solid`
    property, spawns (fixed points + scatter regions with optional
    respawn), triggers. `src/systems/triggers.ts` parses/validates the
    object layers (zod; unknown types fail loudly). 74 tests.
  - **The dungeon is reachable**: barrow door → Hollow Barrow (12 skel/bat
    spots + Rotfang with a data-driven slam attack — enemies.json got an
    optional `slam` block), exit portal back; healing well works (heal
    trigger, 20hp/s); transitions autosave; death+R returns to overworld.
  - Save v2 (`world.currentZone`) — the migration framework's first real
    use; a full v1 fixture upgrade is tested. Zone survives page reload.
  - Verified headless end-to-end (transitions, spawn correctness, slam
    damage signature 22 vs contact 16, portal coords, well heal rate, zone
    persistence, dungeon fog screenshot). Zero console errors.
- **Milestone 0.4 is COMPLETE — all 5 checkboxes ticked.** Versioned save
  system: `src/systems/save/` (schema v1, migration walker live from the
  first format, unicode-safe base64 export/import codec, 3-slot
  localStorage store with injected storage for tests).
  - Save shape covers the full roadmap list (level/xp/gold, gear, bag,
    skillRanks, world flags) — fields whose systems don't exist yet persist
    at defaults and pass through load→save untouched (`savePassThrough` in
    WorldScene), so future-written data is never dropped by this build.
  - WorldScene loads slot 1 at boot **before enemies spawn** (their hp
    scales with player level at spawn — this ordering was a real bug caught
    by the smoke test), autosaves every 60s, treats corrupt saves as fresh
    start with a console warning (payload left in storage for rescue).
  - Debug handle: `__AZER.save.now()/.export()/.import(str)`. No UI for
    slots/export yet — that's the settings/menu work in m5.2.
  - Verified headless across real page reloads: progress persists through
    refresh; restored level drives both maxHp and enemy spawn scaling;
    corrupt save boots fresh; export string round-trips. 73 unit tests.
- **Milestone 0.3 is COMPLETE — all 5 checkboxes ticked.** All game content
  (enemies, items, affixes, skills, zones, quests, dialogue) lives in
  `/data/*.json`, validated by zod schemas at boot, failing loudly on bad
  data. Enemies are the proof: `combat.ts`'s hardcoded `ETYPES` is gone
  entirely; `WorldScene` resolves spawnable enemies by cross-referencing
  `zones.json` against `enemies.json` (`src/systems/zoneSpawns.ts`), naming
  no enemy id in code. Verified for real: added a novel "wisp" enemy (new id,
  new sprite key with no art) to the JSON only, rebuilt with zero src/
  changes, and it spawned, rendered via a fallback sprite, and dealt its
  JSON-defined damage in a live headless run — then reverted. That proof is
  now also a permanent unit test (`zoneSpawns.test.ts`), not just a one-off
  manual check.
  - Schemas (`src/data/schemas/*.ts`): one zod schema per content file,
    doubling as the TS types via `z.infer`. `items.json`'s `bases` uses
    `z.partialRecord` (zod v4) since not every slot needs base items defined
    yet. `skills.json` uses a discriminated union on `mechanic`
    (shockwave/leap/execute/buff) to capture each of the prototype's 5
    skills' per-rank scaling as data (base+perRank coefficients) ahead of
    the skill engine landing in Milestone 1.1/1.2 — skills aren't executed
    by any code yet, this is data capture only.
  - Loader (`src/data/loader.ts` + `gameData.ts`): `validateGameData()` is
    pure (takes raw parsed objects, not files) so both real content and
    hand-built bad fixtures are testable without touching disk. Aggregates
    errors across ALL 7 files before throwing — never fails on just the
    first bad file. `BootScene` halts on a full-screen itemized error
    instead of starting the game with partial/invalid content; verified by
    deliberately corrupting `enemies.json`, screenshotting the error screen,
    then reverting (confirmed via `git diff` — no residual change).
  - Content ported from the prototype: enemies (slime/bat/skel/boss — skel
    and boss aren't spawned by any scene yet, they're dungeon-only content
    waiting on 0.5), affixes (all 10 + poison flag), items (5 slots, all
    bases, 5 rarity tiers, 3 legendaries), skills (all 5 warrior skills).
    `quests.json`/`dialogue.json` are empty arrays — no prototype content
    exists for those systems (2.1/2.2 will populate them).
  - 61 total unit tests now (was 24 at the start of this session): schema
    validation (valid/invalid per file), loader aggregation/fail-loudly,
    the zero-code-changes proof, sprite fallback.
- **0.2 parity assessment** (decision on what "parity" meant for Milestone
  0.2's "port the prototype into Phaser scenes" scope, recorded for
  reference): at parity — movement/collision, camera follow, combat core
  (primary attack, damage numbers, cooldown, slime/bat chase+contact),
  fog of war, death/respawn/HUD. Deliberately deferred to their owning
  milestones (not 0.2 gaps): loot/items/affixes (0.3 — now data-complete,
  system lands in 1.x), XP/leveling (1.1), skills 1-5 (1.2), dungeon/
  skeletons/boss/map transitions (0.5), legendary powers (1.5).
- **Milestone 0.2 is COMPLETE — all 6 checkboxes ticked.** The prototype's
  core overworld gameplay now runs in Phaser (scenes, movement, camera,
  combat, fog, death/respawn), verified vs. the HTML prototype (see the parity
  assessment under Current task for the exact scope boundary).
- **Milestone 0.2, checkbox 6: fog of war.**
  - `src/systems/fog.ts` — `fogParams()` pure (radius 100/62 + vision,
    darkness 0.82/0.95) with tests; `FogOfWar` class fills a scrollFactor-0
    RenderTexture at `darkness` and erases a radial sight brush at the player
    each frame. Brush gradient tuned so erase leaves darkness*0.7 at the 0.8
    stop, matching the prototype. O(1) per frame.
  - `Player.visionBonus` stub (real +Vision stat with gear in 0.3).
  - Verified headless: bright centre (95) / dark far corner (36) sampled from
    the screenshot, ~59 fps with fog redrawing every frame (roadmap's "test
    perf early"); screenshot matches prototype look.
- **Milestone 0.2 (all 6 checkboxes) and 0.1 (all 6 checkboxes) — condensed.**
  Full session-by-session detail lives in git history (commit messages are
  thorough); kept here only what a fresh session actually needs:
  - Scenes: `BootScene` → `WorldScene` (gameplay) + `UIScene` (HUD overlay,
    launched in parallel). `main.ts` registers all three; game runs at
    **480x270 internal resolution, zoom 2** (not 960x540) so every ported
    prototype tuning value — speeds, radii, distances — carries over 1:1
    with no rescaling.
  - `src/systems/mapgen.ts`: port of the prototype's Starter Plains
    generator (60x40 tiles, 16px each). Placeholder until Tiled lands in
    0.5. Spawn point (160,496).
  - `src/systems/pixelart.ts`: GBA-palette procedural sprites + a 9-tile
    tileset strip. Now also holds `spriteRowsFor()` with a fallback sprite
    for enemy ids with no dedicated art (added in 0.3, see below).
  - `src/entities/Player.ts`: arcade body, WASD/arrows at 78px/s, `facing`
    vector (for future skill aiming), hp/dead/respawn, several gear-stat
    stubs (aspdPct, critPct, moveSpeedPct, visionBonus) waiting on 0.3's
    item system landing in gameplay (not just data — see Current task).
  - `src/entities/Enemy.ts` / `src/systems/combat.ts`: chase-and-contact AI,
    pooled damage numbers (`DamageNumbers.ts`), attack cooldown, crits. As
    of 0.3 this is fully data-driven — see the 0.3 entry above.
  - `src/systems/fog.ts`: screen-space RenderTexture fog of war, erase-brush
    sight radius, ~59fps measured with fog active.
  - `UIScene`: HP bar + "YOU DIED" overlay, reading a `hud` key WorldScene
    publishes to the registry each frame (keeps scenes decoupled).
  - `window.__AZER = { player, enemies }` is a permanent debug handle (not
    dev-gated) — used by headless smoke tests every session, and doubles as
    a head start on the 2.5 debug-tools task.
  - CI (`.github/workflows/ci.yml`) and Pages deploy
    (`.github/workflows/deploy.yml`) both green. Live at
    https://stevenseagalstreams.github.io/Ashes-of-azer/, deploys
    automatically on push to `dev`.

## Decisions
- Branch protection on `main` could not be configured: no branch-protection
  tool is exposed by the GitHub MCP server available in this session. Left
  for the human to enable in repo Settings → Branches (require PR review
  before merge).
- Scaffolded the Vite project by hand (package.json/tsconfig/vite.config.ts)
  rather than running the interactive `npm create vite@latest` CLI, since the
  repo already has files at root and the CLI's non-empty-directory prompt
  can't be answered non-interactively. End result is equivalent.
- Picked latest stable **TypeScript 5.9.3** over the new TypeScript 7 native
  compiler (just released) — ecosystem tooling (typescript-eslint etc.) is
  far more battle-tested on 5.x for a fresh project.
- Bumped Vite to 8.x and Vitest to 4.x (over the versions I initially
  targeted) after `npm audit` flagged moderate/high/critical dev-server-only
  vulnerabilities in the older esbuild/vite chain; latest majors resolve them
  (`npm audit` now clean).
- Deploy target: **GitHub Pages**, per user's explicit choice when asked
  (CLAUDE.md requires asking before anything "publishing"). itch.io was the
  alternative but needs a butler API key / new account setup.
- Vitest set to `passWithNoTests: true` rather than adding a placeholder test
  — there's no real logic yet to test at 0.1; real tests start with 0.3's
  data-driven systems, per CLAUDE.md's verification rules. (First real tests
  landed with mapgen in 0.2.)
- Placeholder map: ported the prototype's generator into `src/systems/mapgen.ts`
  (option "a" from last session's notes) instead of a bare bounds rectangle —
  it gives collision something real to verify against, keeps visual parity,
  and its pure functions are unit-testable. Tiled replaces it in 0.5.
- Game internal resolution set to 480x270 with zoom 2 (not 960x540 native) so
  the prototype's tuning values port 1:1 without rescaling every constant.
- `window.__AZER` debug handle is exposed unconditionally (not dev-gated):
  needed by headless smoke tests against prod builds, harmless to players,
  and a head start on the 2.5 debug-tools task.
- **0.3**: zone spawn selection is uniform-random across a zone's
  `enemyTypes` (`Phaser.Utils.Array.GetRandom`), not the prototype's
  hardcoded 70% slime / 30% bat weighting. A tuning simplification, not a
  bug — CLAUDE.md says tuning values are mine to decide. If spawn weighting
  ever matters for balance, it'd be a `weight` field added to
  `ZoneSchema.enemyTypes` (currently plain id strings).
- **0.3**: `items.json`'s `bases` uses zod v4's `z.partialRecord` instead of
  `z.record` — not every item slot needs base items defined yet (future
  slots from Milestone 4.x can be added to `slots` before any bases exist).
- **0.3**: skills.json captures per-rank scaling as data (discriminated
  union on `mechanic`) but nothing executes it yet — no code reads
  `skills.json` at runtime. That's intentional; the skill engine is
  Milestone 1.1/1.2's job. Don't be surprised skills.json looks "unused."
- **0.3**: `boss` enemies get a wider (30px vs 12px) hp bar in `Enemy.ts` —
  ported for free since the `boss` flag was already in the schema, even
  though no boss is spawned anywhere yet (dungeon lands in 0.5).

- **1.3**: the Mage design was mine to set — the `AskUserQuestion` tool was
  unavailable (container/permission failures) across two attempts, and the
  user had repeatedly said "continue", so I proceeded on recommended defaults
  rather than stall: same **Mana + generators** resource model as the Warrior
  (Arcane Pulse is the mana-refunding generator), the "light" element model
  (fire burns, frost chills, **no resistances**), and a 14-active/10-passive
  kit mirroring the Warrior's size. Elements are flavour+one status each, not
  a full damage-type/resist system — that can layer on later without reworking
  this. Revisit with the user if the Mage's feel needs a different resource or
  if resistances become a design goal.
- **1.3**: Frost Nova and Blink reuse existing mechanics (`shockwave` with a
  stun = "freeze", `leap` = teleport) rather than new ones — the freeze reads
  as a stun and no new engine code was needed. If a true root/freeze distinct
  from stun is wanted later, add a `chill`-heavy or dedicated status.
- **1.3**: `hasExistingSave()` in BootScene treats a *corrupt* slot-1 save as
  "existing" (skips class-select) — the World's `loadSaveSafe()` already
  recovers a damaged save as a fresh Warrior, so re-routing to class-select
  would double-handle it. Only a genuinely empty slot 1 shows the picker.
- **1.4**: proceeded on recommended defaults again (the `AskUserQuestion` tool
  keeps failing in this environment, and the user said "continue"). Hunter uses
  the same **Mana + generators** model (Point Blank is the generator) and the
  light element model. The **pet does not draw enemy aggro** — reworking enemy
  AI to target the pet would be a much bigger change; instead the pet takes
  contact damage only when an enemy is already adjacent (which happens because
  enemies chase the player and the pet heels to the player). If pets should
  tank, that's a follow-up: give enemies a "nearest of {player, pet}" target.
- **1.4**: Multi Shot is `count`+`spreadArc` ON the existing `projectile`
  mechanic rather than a new mechanic, so pierce/chain/split/element all
  compose with it for free (and a `skillMod` in 1.5 can bump `count`).
- **1.5**: legendary "powers" are **data, not code dispatch** — a legendary
  carries `skillMods[]` and `hooks[]` that the engine interprets generically,
  so adding a legendary that reuses existing mod fields / hook effects needs
  **zero code** (CLAUDE.md's most important rule). A genuinely new *effect
  type* (beyond explode/burn/chill/heal/manaGain) or a new moddable **absent**
  field still needs a one-line addition (to `runHooks` / the `CREATABLE`
  whitelist) — that's a new mechanic, treated like adding a skill mechanic.
- **1.5**: skillMods apply by resolving an **effective skill** (base +
  equipped mods) that the cast path and tooltips read unchanged — no per-mod
  branching in the cast switch. Present fields are detected by runtime shape
  (RankScaling vs number vs bool); absent fields are created only for a
  whitelist (`split/chainRange/returns/count/pierce/chain/burnDps`) to avoid
  the `radius`-is-number-on-projectile-but-RankScaling-elsewhere ambiguity.
- **1.5**: `element`-changing mods are intentionally NOT supported (skillMod
  value is numeric). The Fireball example doesn't need one (Fireball already
  burns). If a "make skill X deal fire" mod is ever wanted, add an
  element/string mod channel then.
- **1.5**: no equip UI yet — `effectiveSkills`/hooks are computed once in
  `create()` from `saveData.gear`. When the loot/equip system lands, call the
  recompute (`computeEffectiveSkills` + `collectItemHooks` + rebuild hotbar +
  rebuild SkillUI) on every gear change. Tests equip via the save directly.

## Backlog
- Enable branch protection on `main` (human, GitHub Settings → Branches) —
  still outstanding, no tool available to me to do this.

## Needs human playtest
- ~~Movement/collision/camera feel~~ — **confirmed by user 2026-07-14**:
  walking works, trees and water block correctly.
- ~~Combat/fog/death loop~~ — **confirmed by user 2026-07-14** ("it works!").
- Nothing new to playtest from Milestone 0.3 — it's pure architecture, enemy
  behavior is identical to before the refactor (verified headless). Next
  playtest-worthy milestone is likely 1.1+ (skills become usable) or
  whenever loot starts dropping.
- Milestone 0.4 (saves) is spot-checkable if curious: play a bit, refresh
  the page — no progress popup or UI exists yet, but nothing should reset
  oddly or error. (Persistence itself is machine-verified; today level
  never changes during play, so there's little visible to notice. Real
  visible payoff arrives with XP/loot.)
- **Milestone 0.5 — the big one to playtest**, on the live site after
  deploy:
  - Walk east along the path to the dark doorway (top of the clearing by
    the lake) and step in → you should land in the Hollow Barrow: tight
    dark fog, purple floors, skeletons and bats hunting you.
  - Find ROTFANG (far north-east room): red expanding ring = ground slam,
    22 damage — does the fight feel dangerous but readable? (No loot from
    him yet — item system is next milestone-ish.)
  - Die in there → "YOU DIED" → R → back at the plains spawn, full hp.
  - Teal portal (south-west of the dungeon) → returns you outside near the
    door. Refresh mid-dungeon → you should come back *in the dungeon*.
  - Stand by the healing well (small blue well near spawn) after taking
    damage → hp visibly refills.
  - **Open assets/maps/overworld.json in the Tiled editor** (install from
    mapeditor.org) — it should open cleanly with visible art (tiles.png)
    and editable layers. This is the one part of 0.5 I can't verify.
- **Skill panel (m1.1 UI)**: press K — spend points (kill slimes to level
  up first), learn Execute (4) and try it on a low-hp enemy. Hotbar at the
  bottom: cooldown numbers, blue outline when out of mana. Does the panel
  read well at the game's scale?
- **Town + Vendor (m2.3)**: from the plains, head to the **doorway west of the
  path** (near the healing well) — it should drop you into **Ashfall Village**
  (grass plaza, stone buildings, a well). Find **Merchant Pell** (a green-aproned
  NPC) and press **E** to trade: buy something (gold in the header ticks down),
  sell a drop (gold ticks up), press E to leave. The gate at the south end of
  the plaza returns you to the plains. Does the town read as a place? Is Pell
  easy to find? Prices feel sane? Two more services stand nearby: **Master Vane**
  (trainer — "Reset my skills" wipes spent points; "Give me a trial" starts a
  hunt) and **Stashkeeper Odd** (E opens a bag↔stash mover). Any trouble telling
  the service NPCs apart or knowing what each does?
- **Thornhollow (m2.4)**: from the Reach, take the **north spur off the main
  path** to the forest town. Smoke-verified all four services open and both gates
  work — but **placement/feel want human eyes**: are the four service NPCs easy to
  find under their buildings, and does the forest-floor town read as distinct from
  Ashfall (not just a recolor)? Is the north-spur route to it obvious enough?
- **Bramblewarren dungeon (m2.4)**: at the **far east end of the Reach's path**, a
  cave mouth drops into the dark barrow; fight through to Mossmaw's chamber and the
  Verdant Heart relic. Smoke-verified the gates/kill/relic — but **feel wants human
  eyes**: is the barrow entrance findable, the dungeon layout fun to clear, and the
  mini-boss fight (slam + spore-summons in a dark room) fair and readable?
- **Reach enemy patterns (m2.4)**: fight in the Verdant Reach and read the four
  new foes — thornwolf (yellow flash → dash), sporeling (red flash + ring →
  explodes), spitter (shoots from range, backs away), grovewarden (hangs back,
  spawns sporelings). Smoke-verified each behavior fires; **tuning + readability
  want human eyes**: are the telegraphs long enough to react to? Is the mix fun or
  overwhelming (esp. grovewarden + sporeling swarms)? Are damage/HP values fair
  for a just-past-plains player? Do the procedural sprites read as distinct?
- **The Verdant Reach (m2.4)**: take the **east path out of the plains** (past
  the town turn-off) to the forest gate. Smoke-verified it loads, transitions
  both ways, spawns enemies, and runs ~61 fps — but the **look and feel want
  human eyes**: do the new forest tiles (dark floor, pines, mushrooms) read as a
  distinct, appealing zone? Is the 3× map fun to traverse or does it feel empty
  between glades? Is the winding path legible, and enemy density (30) right?
- **Ashfall quest chain (m2.3)**: five new townsfolk carry a story — start at
  **Wellkeeper Sena** (by the well, NW) and follow the **!/?** markers to Kessa
  (by the south gate), Doran (east path), Mira (west path), Halden (north path).
  Smoke-verified they all spawn and their dialogue/accepts work, but **placement
  and pacing want human eyes**: are the NPCs easy to find and spaced well (not
  overlapping buildings/each other)? Does the chain's kill-count pacing feel
  right, and do the hand-offs ("go see Kessa next") read clearly?
- **Blacksmith (m2.3)**: **Smith Bralla** stands at the west building; press **E**
  to open the forge. Fight for a while first — gear loses **durability** as you
  swing (a broken piece stops giving stats; you'll see "GEAR BROKE"). At the
  smith, the top **repair** rows show worn gear with a gold cost (click one, or
  "Repair All"); below, a **CRAFT** section lists your **materials** (dropped by
  enemies as little colored chips) and recipes you can forge for materials +
  gold. Does wear feel too fast/slow? Are repair costs and craft recipes worth
  it? Do materials drop often enough to actually craft?
- **Loot loop (m1.7)**: kill things and watch for **gems** to pop out (bosses
  always drop) — walk over one to bank it (a rarity-colored name toast floats
  up). Press **I**: equip a bag item (does your damage/HP number in the HUD
  change?), hover for the affix tooltip, unequip to send it back. Find a
  legendary (they're rare — Rotfang always drops, or farm) and equip it: its
  skill should visibly transform (e.g., Emberfall's Fireball starts splitting).
  Does the drop→equip→feel-stronger loop land? Drop rate too high/low?
- **NPCs & dialogue (m2.2)**: start a new game — **Elder Maru** stands a bit
  east of spawn with a **?** over him. Walk up (a "▲ Talk (E)" prompt appears),
  press **E**: a portrait dialogue with a text crawl. Talking completes "A Word
  with the Elder"; his **Accept** choice starts "The Elder's Hunt" (kill 6
  bats), and his marker flips **?**→ (accept) → **?** while active. Does the
  conversation read well? Portrait legible? Does the ! / ? guidance feel clear?
- **Quests (m2.1)**: start a new game — the tracker (top-right) should show
  "Cull the Slimes 0/5". Kill slimes and watch it tick up; at 5/5 it should
  complete (gold + XP toast) and "Into the Barrow" should appear pinned. Press
  **J** for the journal (Active + Completed; click a quest to pin it). Step into
  the dungeon door → "Into the Barrow" completes and "Slay Rotfang" begins.
  Does the flow read clearly at the game's scale? (No NPCs yet — quests
  auto-accept for now; NPC-given quests come with 2.2.)
- **Combat feel (m1.6)**: play any class and just fight — the whole point is
  *feel*, which only human eyes can judge. Watch for: the walk bob + attack
  lunge; the yellow **brace-flash** before an enemy melees you and the slam
  ring appearing *before* Rotfang's slam; the brief **freeze + screen-shake**
  when you land a crit; enemies getting **knocked back** by your hits; and foes
  **splat-fading** on death. Damage numbers: gold crits are big, DoT ticks
  small, the red numbers when you get hit. Does it feel punchy? Any telegraph
  too long/short, knockback too strong, hit-stop too jarring? (All the timings
  are constants — easy to tune to your taste.)
- **Item-modifies-skill (m1.5)**: no loot drops yet, so this needs a save
  edit to see live — in the console run (as a Mage):
  `let s=JSON.parse(localStorage.azer['azer:save:1']||localStorage.getItem('azer:save:1')); s.gear={Ring:{slot:'Ring',name:'Emberfall Signet',base:3,rarity:'legendary',affixes:[],power:'emberfall'}}; localStorage.setItem('azer:save:1',JSON.stringify(s)); location.reload()`
  then Continue. Press **K** — Fireball's tooltip should now read
  "splits… chains… returns… burns". Cast it into a group: the bolt should
  fork, hop between enemies, and fly back. Try **Frostheart** (`power:'frostheart'`)
  — slain enemies should burst in a nova. Does an item visibly transform a
  skill? (This is the whole game's promise — worth eyeballing the feel.)
- **Title menu (m5.2 preview)**: on load you should see ASHES OF AZER with
  **Continue** (your Warrior, with level shown) and **New Game**. Continue
  should drop you straight into the world as your existing character. New Game
  → class picker; the ← Back button should return you to the menu; picking a
  class over your existing save should ask you to click again to confirm before
  it replaces the save. Does the menu read well at the game's scale?
- **Hunter class (m1.4)**: from the Title menu **New Game → Hunter**. Left-click
  aims. Quick Shot (1) streams arrows; Multi Shot (2) should visibly fan
  several arrows at once. Learn and slot the rest via the K panel as you level:
  - **Traps** (Snare/Explosive/Frost): cast drops one at your feet as a faint
    ring; it brightens when armed, then detonates the moment an enemy walks in
    (Snare stuns, Explosive burns, Frost chills). Does the arm→trigger timing
    feel right?
  - **Summon Wolf**: a companion should appear (currently the fallback sprite —
    see Asset requests), heel to you, chase and bite enemies, show a green HP
    bar, and — if it dies — respawn at your side after a few seconds. Re-casting
    heals/recalls it.
  - **Rapid Fire**: your basic attacks should visibly speed up for its duration.
  Machine-verified, but the *feel* (fan spread, trap timing, pet pathing) wants
  human eyes.
- **Mage class (m1.3)**: from the Title menu choose **New Game** → the picker
  offers Warrior / Mage / Hunter. Pick Mage (confirm the overwrite if
  prompted):
  - Left-click aims; Arcane Bolt (1) should stream cheap bolts toward the
    cursor. Fireball (2) should leave a lingering orange burn tick on foes;
    Ice Shard (3) should visibly slow them (frost). Chain Lightning should
    hop between nearby enemies.
  - Flame Wall / Blizzard (ground patches) and Meteor (telegraph then slam)
    should drop where you aim. Does the projectile feel + fire/frost read
    clearly at the game's scale? (This is the machine-verified-but-eyeball-me
    part: travel speed, hit radius, and how "juicy" the elements look.)
  - Confirm your **existing Warrior** character still loads straight into the
    world with its own kit (the picker should NOT appear for an existing save).
- **Skills (m1.1 engine)**: in combat try 1 (Shield Slam — gold ring, stun),
  2 (Whirlwind — bigger orange ring), 3 (Leap — dash + green ring). Watch
  the blue mana bar drain/refill and cooldowns gate spamming. Kill slimes
  until the green XP bar fills → "LEVEL 2!" burst, full heal. Does casting
  feel responsive? (4/5 are locked until the skill panel lets you spend
  points — next sub-task.)

## Asset requests
- **Pet/wolf sprite (m1.4)**: the Hunter's Summon Wolf currently renders with
  the fallback enemy sprite (key `petwolf` → `DEFAULT_ENEMY_ROWS`). A dedicated
  4-direction companion sprite (wolf/hawk/etc.) would make it read as an ally,
  not an enemy. Purely cosmetic; the pet works.
- **Hunter arrow/trap VFX (m1.4)**: arrows reuse the generic projectile dot and
  traps a tinted circle. Fine for now; a proper arrow sprite + trap telegraph
  art would sell the class. Cosmetic.
- **⭐ Character sprite sheets (m1.6 — BLOCKS the last 1.6 box)**: the one
  unchecked 1.6 box is "4-direction walk/attack/hit/death sheets for all 3
  classes (32×32, 4–6 frames)". This needs an **art-direction decision**
  (CLAUDE.md: ask before art). Today all classes share the single procedural
  `hero` sprite and there are no animation frames. Decide with the user: source/
  commission a cohesive 3-class set, hand-draw procedural multi-frame sheets, or
  defer directional sheets (the procedural squash/lunge stands in for now). Once
  chosen, the sprite system needs a spritesheet loader + a per-entity anim state
  machine. **Everything else in 1.6 is done and doesn't depend on this.**
