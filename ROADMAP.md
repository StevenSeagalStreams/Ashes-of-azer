# Ashes of Azer — Development Roadmap

A step-by-step checklist from prototype to full game. Work top to bottom; each milestone
produces a playable build. Checkboxes are GitHub-flavored — they render as a live
progress tracker on the repo.

**Estimates assume solo development, part-time.** Full-time roughly halves them.

---

## Milestone 0 — Technical Foundation (3–5 weeks)

Nothing new for players here, but every later step gets 3× faster. Do not skip.

### 0.1 Project setup
- [x] Create repo with `main` + `dev` branches; protect `main` (branch protection needs a human — see PROGRESS.md)
- [x] Init project: Vite + TypeScript + Phaser 3 (`npm create vite@latest`)
- [x] Configure ESLint + Prettier, strict tsconfig (`strict: true`)
- [x] Folder structure: `/src/scenes`, `/src/systems`, `/src/entities`, `/data`, `/assets`
- [x] Set up GitHub Actions: lint + typecheck + build on every push
- [x] Deploy pipeline: auto-publish `dev` builds to itch.io or GitHub Pages

### 0.2 Port the prototype into Phaser scenes
- [x] `BootScene` (asset loading, data loading), `WorldScene` (gameplay), `UIScene` (overlay)
- [x] Port player movement + collision to Phaser arcade physics
- [x] Port camera follow with world bounds
- [x] Port the combat core: hit detection, damage numbers, cooldowns
- [x] Port fog of war as a Phaser render texture / mask (test performance early)
- [x] Verify feature parity with the HTML prototype before continuing (overworld loop at parity; loot/skills/XP/dungeon owned by later milestones — see PROGRESS.md)

### 0.3 Data-driven content (highest-leverage task in the project)
- [x] Define JSON schemas: `items.json`, `affixes.json`, `enemies.json`, `skills.json`, `zones.json`, `quests.json`, `dialogue.json`
- [x] Write TypeScript types for every schema (`zod` recommended — validates at load time)
- [x] Loader that reads all JSON at boot and fails loudly on invalid data
- [x] Move every hardcoded item, affix, enemy, and skill from the prototype into JSON
- [x] Test: add a new enemy type by editing JSON only — zero code changes

### 0.4 Save system
- [x] Serialize: character (level, xp, stats), gear, bag, skill ranks, gold (stats recompute from level+gear by design; gear/bag/skill ranks persist as data now, mutate when their systems land in m1.x)
- [x] Serialize world state: quest flags, killed bosses, discovered zones, corruption level
- [x] Save slots (3) + autosave on zone transition and every 60s (zone-transition trigger call-site lands with 0.5's transitions)
- [x] `saveVersion` field + migration functions so old saves survive updates
- [x] Export/import save as base64 string (cheap cloud-save substitute + debugging tool)

### 0.5 Tilemap pipeline
- [x] Install Tiled map editor; define tileset conventions (collision layer, spawn layer, trigger layer) — conventions in assets/maps/README.md; Tiled itself installs on the human's machine to edit the committed maps
- [x] Phaser loader for Tiled JSON maps
- [x] Rebuild Starter Plains and Hollow Barrow as hand-crafted Tiled maps (prototype layouts frozen into editable Tiled JSON by scripts/generate-maps.mjs)
- [x] Trigger system: zone transitions, dungeon doors, cutscene triggers as Tiled objects (cutscene type parsed/validated, inert until m2.x)

**Milestone complete when:** the prototype gameplay runs in Phaser, all content lives in JSON, saves persist across refresh, and maps are made in Tiled.

---

## Milestone 1 — Combat & Class Depth (4–6 weeks)

### 1.1 The 6 active / 6 passive build system
- [x] Skill loadout UI: drag skills from library into 6 active slots (keys 1–6)
  - [x] Skill execution engine: cast the 5 warrior skills from skills.json (mana pool/regen, per-skill cooldowns, rank scaling, stun) + XP → levels → skill points (implied dependency, no other owning checkbox)
  - [x] Skill panel UI (HTML/CSS overlay): library, rank-up with skill points, hotbar with cooldown/mana state
  - [x] Drag skills from library into 6 active slots (keys 1–6), loadout persisted in the save
- [x] Passive skill type in `skills.json` (always-on modifiers)
- [x] 6 passive slots with their own UI
- [x] Respec: free skill-point reset at the town trainer (tune cost later) — free RESPEC button in the K panel; moves to the trainer in m2.3

### 1.2 Warrior — complete kit (~25 skills)
- [x] Fill the kit per the design doc structure: primary, generator, spender, utility, ultimate
- [x] 12–15 actives (Shield Slam, Whirlwind, Leap, Execute, War Cry + ~8 new)
- [x] 10–12 passives (e.g. "+15% dmg to stunned", "Whirlwind pulls enemies", "block chance") — 10 passives; "Whirlwind pulls" deferred to m1.5 (item-modifies-skill)
- [x] Resource model: rage/mana generation and spending per the doc — user chose mana + mana-restoring generators

### 1.3 Mage class
- [x] Kit from the doc: Frost Nova, Fireball, Blink, Meteor + fill to ~25 skills
- [x] Projectile system (speed, piercing, chaining, splitting — data-driven properties)
- [x] Ground-effect system (burning ground, frost patches) — reused by enemies later
- [x] Class selection screen at new game

### 1.4 Hunter class
- [x] Multi Shot: projectile fan (count + spread) reusing the projectile engine
- [x] Trap system: placed entities with trigger radius and arming time
- [x] Pet AI: follow, attack player's target, pet HP/respawn
- [x] Rapid Fire: temporary attack-speed self-buff
- [x] Kit: Multi Shot, Trap, Pet, Rapid Fire + fill to ~25 skills
- [x] Enable Hunter in the class-select menu

### 1.5 Item-modifies-skill system (the heart of the design)
- [x] `skillMod` data model + pure resolver: fold equipped item mods onto a skill (`{"skill":"fireball","mod":"split","value":3}`)
- [x] Projectile `returns` (boomerang) engine support — the last link of the example chain
- [x] Equipped-gear → active skillMods: WorldScene builds effective skills from `saveData.gear` legendaries
- [x] Affix/legendary hook types: `onCast`, `onHit`, `onKill` as data-driven effects
- [x] Implement the doc's example chain end-to-end: Fireball splits → chains → burns → returns
- [x] At least 2 skill-modifying legendaries per class
- [x] Tooltips show modified skill values (item bonuses included)

### 1.6 Combat feel pass
- [x] Procedural motion now (no art dep): walk squash/bob + attack lunge on hero & enemies
- [ ] Final 4-direction walk/attack/hit/death sheets for all 3 classes (32×32, 4–6 frames) — needs art direction (Asset request)
- [x] Enemy attack telegraphs: windup flash + area indicator before every hit
- [x] Hit-stop (2–3 frame freeze on hit), screen shake on heavy hits, knockback
- [x] Death animations + corpse fade instead of instant despawn
- [x] Damage number pass: crits pop bigger, DoT ticks smaller, player damage red

**Milestone complete when:** all 3 classes are playable with full kits, builds differ meaningfully, and at least one "my fireball behaves completely differently now" legendary works.

### 1.7 Loot & inventory (the loot loop) — added scope; the town (2.3) and the core pillar depend on it
- [x] Loot roll engine (pure): rarity → base → affixes from items.json/affixes.json, plus legendary drops
- [x] Enemies drop items on death; ground pickups the player walks over to collect into the bag
- [x] Gear affects stats: equipped affixes feed derived stats (dmg/hp/crit/aspd/ms/cdr/lifesteal/mana-on-kill/vision)
- [x] Inventory UI (I): bag grid + equipment slots, equip/unequip, rarity-colored item tooltips

---

## Milestone 2 — World, Quests & Towns (5–8 weeks)

### 2.1 Quest system
- [x] Quest schema: objectives (kill N / collect N / talk to / reach), rewards, prerequisites, chain links
- [x] Quest journal UI (J): active, tracked, completed
- [x] On-screen tracker for the pinned quest
- [ ] Objective markers on minimap/compass — deferred: no minimap exists yet; pairs with NPC quest-givers (2.2) + a minimap system
- [x] Quest flags integrate with the save system

### 2.2 NPC & dialogue system
- [x] Dialogue schema: nodes, choices, conditions (quest state, corruption level), flags set
- [x] Dialogue UI: portrait, text crawl, choice buttons
- [x] NPC entities: idle wander, interaction prompt, quest indicator (! / ?)

### 2.3 First real town (Starter Plains)
- [x] Town map in Tiled: 6–10 buildings, enterable interiors or facades — Ashfall Village (6 building facades, gate from the plains, well)
- [x] **Vendor**: buy/sell UI, gold economy, stock refreshes on level-up
- [x] **Blacksmith**: repair (durability system) + crafting (recipes in JSON, materials drop from enemies) — Smith Bralla: repair worn gear for gold; forge items from dropped materials (data/recipes.json)
- [x] **Trainer**: respec + class quest giver — Master Vane (free respec + The Trainer's Trial); per-class quest variants are future content
- [x] **Stash**: shared storage chest — Stashkeeper Odd (save v7 stash array, bag↔stash)
- [x] 5–8 quest NPCs forming the zone's quest chain — the **Ashfall** chain: 5 NPC-given quests (Wellkeeper Sena → Warden Kessa → Scout Doran → Herbalist Mira → Priest Halden), each gated behind the last

### 2.4 Zone 2 — Forest Kingdom (full production, sets the template)
- [ ] Tileset + map (~3× Starter Plains size)
- [ ] Town with all services
- [ ] 4–5 new enemy types with distinct attack patterns
- [ ] Dungeon with mini-boss + relic fragment
- [ ] World boss (open-world, respawns, announced spawn)
- [ ] Faction + reputation track (rep from quests/kills, vendor unlocks at rep tiers)
- [ ] Quest chain (8–12 quests) with a zone story
- [ ] 2–3 secrets (hidden areas, optional boss, lore items)
- [ ] **Write down the hours this zone took — it calibrates the rest of the plan**

### 2.5 Zone template & tooling
- [ ] Document the zone production checklist from 2.4 as a repeatable template
- [ ] Debug tools: teleport, spawn item/enemy, set corruption, god mode (dev builds only)

**Milestone complete when:** a new player can play Starter Plains → Forest Kingdom with quests carrying them, and you know your real cost-per-zone.

---

## Milestone 3 — The Corruption System (3–4 weeks)

Prototype this cheaply before building all 8 zones — it changes what assets every zone needs.

- [ ] Global corruption value (0–100) driven by relic fragments collected
- [ ] Corruption tiers (0/25/50/75/100) as world-state flags
- [ ] Cheap visual layer first: palette/tint shifts per tier, particle ambience (ash, embers)
- [ ] Dialogue variants per tier (conditions already supported by 2.2)
- [ ] Spawn table variants per tier: corrupted enemy versions (recolor + 1 new move)
- [ ] 1–2 scripted town changes per tier (an NPC disappears, a building boards up)
- [ ] Music layer shifts with corruption
- [ ] Ending branch: at max fragments, the three-way choice (Destroy / Control / Become) — 3 final quests + 3 ending sequences
- [ ] Playtest: does rising corruption feel ominous or just cosmetic? Iterate before scaling to all zones.

---

## Milestone 4 — Content Buildout (16–28 weeks — the long middle)

Zones 3–8, one at a time, each shippable as a content update. Per zone, run the 2.5 template:

- [ ] **Zone 3 — Haunted Marsh** (poison/DoT theme, undead roster)
- [ ] **Zone 4 — Desert Empire** (elite packs, faction conflict storyline)
- [ ] **Zone 5 — Frozen Peaks** (frost enemies — synergy/counter to frost builds)
- [ ] **Zone 6 — Volcanic Depths** (ground hazards, burning ground everywhere)
- [ ] **Zone 7 — Sky Isles** (verticality, knockback hazards, flying enemies)
- [ ] **Zone 8 — Ancient Void** (endgame zone, all corruption tiers visible, final bosses)

Parallel tracks while building zones:

### 4.x Itemization buildout
- [ ] Grow legendary roster to 30–50, ~1/3 of them skill-modifying (add 4–6 per zone)
- [ ] **Mythic tier**: ultra-rare, build-warping items (drop only from world bosses / endgame)
- [ ] Remaining slots: belt, necklace, ring 2, offhand (shields, quivers, tomes)
- [ ] Elite/champion enemy modifiers (Extra Fast, Frost-Enchanted, Shielded, Summoner…)
- [ ] Set items (optional — cut if behind schedule)

### 4.x Boss design pass
- [ ] Every zone boss gets 2–3 phases with distinct mechanics (not just bigger HP)
- [ ] World bosses require movement/positioning, not just DPS

---

## Milestone 5 — Presentation & Onboarding (4–6 weeks)

### 5.1 Audio
- [ ] Pick stack: Howler.js or Phaser sound
- [ ] Music: 1 track per zone + town variant + boss theme (license or commission; budget item)
- [ ] SFX: every skill, hit, death, pickup, UI click, level-up (freesound.org + sfxr works)
- [ ] Rarity-tiered drop sounds — the legendary "clink" must feel special
- [ ] Volume sliders (master/music/sfx), settings persisted

### 5.2 UI overhaul
- [ ] Character sheet: all derived stats, gear overview, resistances
- [ ] Minimap + full map (M) with fog-of-war reveal persisted per zone
- [ ] Settings: key rebinding, volume, screen-shake toggle, damage-number toggle
- [ ] Controller support (Phaser gamepad API) + UI navigation with d-pad
- [ ] Item comparison tooltips (hover = show vs. equipped, stat deltas colored)
- [ ] Loot filter toggle (hide white/magic drops in endgame)

### 5.3 Onboarding
- [ ] Tutorialized first 15 minutes: movement → combat → first drop → equip → first skill point → first dungeon, taught through play, not text walls
- [ ] Contextual hints (first legendary, first corruption event) — each shown once
- [ ] New-player playtest: watch 3 people who've never seen it; fix every point of confusion

---

## Milestone 6 — Endgame (5–8 weeks)

Ship at minimum the first two items, or players finish in a weekend and leave.

- [ ] **Nightmare tiers** (NM1–NM10): scaling enemy stats, new affixes on enemies, better loot tables per tier
- [ ] **Randomized dungeons**: room-graph generation from hand-made room pieces, random enemy sets, random modifiers ("enemies explode on death"), scaling rewards
- [ ] Daily contracts: 3 rotating objectives with reward crates
- [ ] Rare hunts: named rare spawns with fixed unique drops (D2 Pindleskin-style farm targets)
- [ ] Procedural corruption modifiers on endgame maps
- [ ] Seasonal event framework (even just a data-driven "event enemies + event currency + event vendor" loop)

---

## Milestone 7 — Balance, Polish & Release (6–10 weeks, overlaps everything)

### 7.1 Balancing
- [ ] Spreadsheet model: expected player DPS/EHP per level band vs. enemy stats per zone
- [ ] Affix budget curve: total stat value per item level/rarity follows a formula, not gut feel
- [ ] Drop-rate tuning: target "1 upgrade per 20–30 min" early, slowing toward endgame
- [ ] Kill-time targets: trash 1–3s, elites 5–10s, bosses 60–120s — measure with debug overlay
- [ ] Every class clears the campaign with at least 2 distinct builds (playtest this yourself)

### 7.2 Performance
- [ ] Object pooling: projectiles, particles, damage numbers, corpses
- [ ] Culling: skip update/render for off-screen entities
- [ ] Stress test: 100+ enemies + heavy particle load at 60 fps on a mid laptop
- [ ] Test Chrome, Firefox, Safari; degrade fog/particles gracefully on weak GPUs

### 7.3 External playtesting
- [ ] Private itch.io build + feedback form after every milestone from here
- [ ] Bug tracker: GitHub Issues with labels (bug/balance/feel/crash)
- [ ] Telemetry (even just localStorage counters players can share): deaths per zone, time per level, most-used skills

### 7.4 Release
- [ ] itch.io page: screenshots, GIFs, 60–90s trailer
- [ ] Devlog cadence (itch devlogs / X / TikTok clips of juicy legendary moments)
- [ ] 1.0 scope decision — recommended cut: **3–4 zones, 2 classes, corruption-lite, NM tiers + random dungeons**, remaining zones as free content updates
- [ ] If traction: Steam release via Electron/Tauri wrapper (+ Steam fee, store assets, achievements)

---

## Deferred (post-1.0, only if the game finds an audience)
- 4-player co-op (netcode ≈ doubles the project — needs server authority, sync, lag comp)
- Trading, guilds, seasonal ladders, shared world events
- Cloud saves / accounts
- Mobile touch controls

---

## Suggested working rhythm
1. Always work top-to-bottom within a milestone; don't parallelize milestones.
2. Every milestone ends with a build someone else plays.
3. Keep a `CHANGELOG.md` — it becomes your devlog material for free.
4. When stuck choosing, pick whatever gets loot in players' hands faster. The loot loop is the game.
