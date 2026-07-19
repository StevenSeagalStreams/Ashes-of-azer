# Progress — Ashes of Azer

## Current task
**MILESTONE 1.3 COMPLETE** (Mage class — all 4 boxes ticked). Next:
**Milestone 1.4 — Hunter class**, first box: "Kit: Multi Shot, Trap, Pet,
Rapid Fire + fill to ~25 skills."

Notes for that session:
- 1.4 needs TWO new entity systems the roadmap calls out: **pet AI** (follow,
  attack player's target, HP/respawn) and a **trap system** (placed entities
  with a trigger radius + arming time). Neither exists yet. Multi Shot is a
  fan of `projectile` casts (the projectile engine + `fanAngles()` already
  support this — a multi-projectile mechanic or a `split`-at-origin variant).
  Rapid Fire is a channel/buff. Like the Mage, this is a kit + design the
  docs underspecify — but the user has twice been happy for me to proceed on
  recommended defaults, and the class scaffolding is now all in place (see
  below), so a Hunter is mostly: new mechanics for pet/trap + content tagged
  `class: "hunter"`.
- The class plumbing is DONE and reusable: `ClassSchema` already lists
  `hunter`; `skillsForClass()` filters by class; the save stores
  `character.class`; the class-select screen has a Hunter card (currently
  "coming soon" — flip `playable: true` in `ClassSelectScene.OPTIONS` once the
  kit exists). WorldScene is fully class-scoped via `this.classSkills`, so a
  Hunter save will automatically see only Hunter skills.

## Done
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
- **Title menu (m5.2 preview)**: on load you should see ASHES OF AZER with
  **Continue** (your Warrior, with level shown) and **New Game**. Continue
  should drop you straight into the world as your existing character. New Game
  → class picker; the ← Back button should return you to the menu; picking a
  class over your existing save should ask you to click again to confirm before
  it replaces the save. Does the menu read well at the game's scale?
- **Mage class (m1.3)**: from the Title menu choose **New Game** → the picker
  offers Warrior / Mage / Hunter(coming soon). Pick Mage (confirm the
  overwrite if prompted):
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
(none yet)
