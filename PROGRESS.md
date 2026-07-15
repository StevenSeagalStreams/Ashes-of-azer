# Progress — Ashes of Azer

## Current task
**Milestone 0.2 is COMPLETE.** Next up: **Milestone 0.3 — Data-driven content**
(the highest-leverage task in the project per CLAUDE.md). First unchecked box:
"Define JSON schemas: items.json, affixes.json, enemies.json, skills.json,
zones.json, quests.json, dialogue.json."

Notes for that session:
- The architectural rule that overrides most others (CLAUDE.md): adding content
  must never require code changes. Everything currently hardcoded moves to
  `/data/*.json` validated with **zod** at load, failing loudly on bad data.
- Install `zod` (not yet a dependency). Write a schema + inferred TS type per
  content file, and a loader run at boot (BootScene is the natural home —
  it already exists and does nothing yet).
- What's hardcoded right now and must migrate to JSON:
  - `src/systems/combat.ts` → `ETYPES` (slime/bat stats) → `enemies.json`.
    Also the skel/boss defs still only live in the prototype; add them to
    `enemies.json` too so the dungeon (0.5) can use them without code.
  - The prototype (`ashes_of_azer.html`) still holds the authoritative content
    not yet ported: items/bases (`BASES` ~288), affixes (`AFFIX_POOL` ~295),
    legendaries (`LEGENDARIES` ~308), rarity table (`RARITY` ~319), skills
    (`SKILLS` ~389). Port these straight into JSON rather than into TS first.
  - Tuning constants in `combat.ts`/`fog.ts` are fine to leave as code for now
    UNLESS the roadmap task says otherwise — the rule targets *content*
    (items/affixes/enemies/skills/zones/quests/dialogue), not engine constants.
- The 0.3 acceptance test is explicit: "add a new enemy type by editing JSON
  only — zero code changes." Build toward that as the proof.
- Vite serves `/data/*.json`: import via `import enemies from '../../data/enemies.json'`
  (Vite bundles JSON) OR fetch at runtime. Importing is simpler and lets zod
  validate the bundled object; decide and record which.

### Parity assessment (deliverable of the 0.2 "verify parity" checkbox)
Decision on what "parity" means for Milestone 0.2 (whose scope is *porting the
prototype's core gameplay into Phaser scenes*, not rebuilding every system):

**At parity now** (0.2-scoped systems, verified vs. prototype):
- Movement + collision (WASD/arrows, 78px/s, tree/water/border blocking)
- Camera follow clamped to world
- Combat core: primary attack, hit detection, pooled damage numbers,
  crits, attack cooldown, slime/bat chase + contact damage
- Fog of war (radius, darkness, brush geometry all match)
- Player death → "YOU DIED" → R respawn; HP HUD; overworld enemy respawn

**Deliberately deferred to their owning milestones** (NOT 0.2 gaps):
- Loot drops, items, inventory, equipment, affixes/legendaries → **0.3** (data)
  and the item system. Enemies give no XP/drops yet.
- XP / leveling / skill points → **1.1** (build system). `player.level` exists
  and scales damage but never increases yet.
- Skills 1-5 (Shield Slam, Whirlwind, Leap, Execute, War Cry), mana → **1.2**
  (Warrior kit). Only the primary attack is ported.
- Skeletons, boss (Rotfang), the dungeon map, dungeon fog, healing well,
  map transitions (door/portal tiles are inert) → **0.5** (Tiled pipeline +
  trigger system explicitly owns zone transitions).
- Legendary powers (Frostheart etc.) → **1.5** (item-modifies-skill system).
Nothing above is a regression; each is scheduled work. This is the correct
"parity for 0.2" boundary.

## Done
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
- **Milestone 0.2, checkbox 4b (parity): death/respawn, HUD, overworld respawn.**
  - `Player`: `dead` flag (locks movement/attacks), `respawn(x,y)` to full hp;
    death triggers at hp<=0 in `takeDamage`.
  - `UIScene`: HP bar + text from the `hud` registry key (WorldScene
    publishes it each frame — decoupled), "YOU DIED" overlay container.
  - `WorldScene`: keydown-R respawn (event handler, not JustDown polling —
    the latter was flaky under headless press timing), overworld respawn
    timer topping up toward 10 enemies every 4s clear of the player.
  - Verified headless: death→overlay→hud all set; R respawns to full hp at
    (160,496); emptied overworld refills after the interval.
- **Milestone 0.2, checkbox 4: combat core.**
  - `src/systems/combat.ts` — prototype combat math as pure functions with
    unit tests: attackCooldown (0.45/(1+aspd%)), playerBaseDamage (8+2*lvl),
    rollHit (2x crit, injectable rng), scaledEnemyHp (base*(1+lvl*0.12)),
    reach/radius/contact constants, ETYPES slime+bat (skel/boss arrive with
    the dungeon; all of it moves to JSON in 0.3).
  - `src/entities/Enemy.ts` — chase player inside aggro, stop at contact
    range, 0.9s contact-attack cooldown, hp bar (two rectangles), white hit
    flash, death destroys cleanly. Collides with the tile layer.
  - `src/entities/Player.ts` — hp/maxHp (100 @ lvl1), critPct 5, aspdPct 0
    stubs, takeDamage with red number + hurt alpha flash. Death/respawn flow
    deliberately deferred to the parity checkbox.
  - `src/systems/DamageNumbers.ts` — pooled floating text (recycled through
    tween-complete), black stroke, crits yellow #ffd84a, player dmg #f08060.
  - WorldScene: SPACE attacks along facing (slash arc flash), prototype
    populate() port spawns 14 slimes/bats on walkable tiles ≥90px from spawn.
  - Verified headless: enemy teleported next to player chased to 12.6px
    (contact range) and stopped; died to expected swing count; player hp
    dropped by exactly prototype damage values (slime 6 + bat 5); zero
    console errors; screenshot eyeballed (numbers float/fade, hp bars).
    21 unit tests green.
- **Milestone 0.1 — Project setup: all 6 checkboxes complete.**
  - `dev` branch created on GitHub (points at `main`).
  - Vite + TypeScript + Phaser 3 scaffolded by hand (package.json, strict
    tsconfig, vite.config.ts, index.html, src/main.ts booting a placeholder
    Phaser scene). Verified: typecheck/lint/test/build all green, and the
    boot screen was checked in a headless Chromium (canvas renders, "Ashes of
    Azer" text visible, no console errors — see screenshot taken during
    session, not committed).
  - ESLint (flat config, typescript-eslint + eslint-config-prettier) and
    Prettier configured. Vitest wired up (`passWithNoTests: true` until real
    systems land in 0.3 and get real tests).
  - Folder structure: `/src/scenes`, `/src/systems`, `/src/entities`, `/data`,
    `/assets` (placeholder `.gitkeep` files).
  - GitHub Actions CI (`.github/workflows/ci.yml`): typecheck + lint + test +
    build on every push/PR. Verified locally with `npm ci` (clean install
    matching the lockfile) running the exact same commands.
  - GitHub Actions deploy (`.github/workflows/deploy.yml`): fully verified
    green (typecheck/lint/test/build/configure-pages/upload-pages-artifact/
    deploy-pages), after two human-side settings were fixed (Pages source =
    GitHub Actions; `github-pages` environment's branch restriction opened up
    to allow `dev`). Live at
    https://stevenseagalstreams.github.io/Ashes-of-azer/ — currently shows
    the Milestone 0.2 scene-skeleton placeholder ("Ashes of Azer" text), not
    real gameplay yet.
  - `CHANGELOG.md` created with an `## Unreleased` heading.
- **Milestone 0.2, checkboxes 2-3: movement + collision, camera follow.**
  - `src/systems/mapgen.ts` — port of the prototype's Starter Plains
    generator (same constants: 60x40 tiles of 16px, lake, path, clearings,
    dungeon door at (48-49,15), spawn at (160,496)). Placeholder until Tiled
    lands in 0.5. `solid()` = tree/water/dwall. 9 Vitest unit tests cover the
    generator's invariants (dims, border, path, door, lake, clearing,
    out-of-bounds lookups solid).
  - `src/systems/pixelart.ts` — port of the prototype's GBA palette +
    sprite-from-string-rows helper (hero sprite) and a generated 9-tile
    tileset strip texture (grass/tree/water/path/door/dfloor/dwall/portal/
    flowers).
  - `src/entities/Player.ts` — arcade-physics sprite; WASD + arrows,
    normalized diagonals, BASE_SPEED 78 px/s (prototype value), `facing`
    vector kept for later skill aiming, `moveSpeedPct` stub for gear stats
    (wired in 0.3), 10x10 body ≈ prototype's radius-5 circle.
  - `WorldScene` builds the tilemap from the generated grid, sets collision
    on solid tiles, world + camera bounds, `startFollow(player)` (equivalent
    to the prototype's clamped hard-follow), and exposes `window.__AZER =
    { player }` as a debug handle (used by headless smoke tests; also useful
    for the 2.5 debug-tools task later).
  - Game config: 480x270 internal resolution at 2x zoom = prototype's canvas
    exactly, so every ported tuning value (speeds, radii, distances) is 1:1.
  - Verified headless (Playwright + bundled Chromium against the prod
    build): +54.6px after 0.7s holding right (~78 px/s); pushing left into
    the border wall stops the body at x=21 (wall edge 16 + half-body 5) with
    no clip-through and no vertical drift; camera keeps player at view
    centre (scrollX = px-240 exactly) and clamps at world edges; zero
    console errors. Screenshots eyeballed: world renders (grass/trees/path/
    flowers/hero) in the right palette.
- **Milestone 0.2, first checkbox: scene skeleton done.**
  - `src/scenes/BootScene.ts` — starts `WorldScene`, launches `UIScene` in
    parallel (empty for now; will do asset/data loading once there's
    something to load, in later 0.2/0.3 work).
  - `src/scenes/WorldScene.ts` — gameplay scene; currently just shows the
    placeholder text that used to live directly in `main.ts`.
  - `src/scenes/UIScene.ts` — empty overlay scene, ready for HUD work.
  - `main.ts` now registers `[BootScene, WorldScene, UIScene]` instead of an
    inline placeholder scene. Verified in headless Chromium: scene handoff
    works, canvas renders, no console errors beyond the pre-existing
    favicon 404 (cosmetic, not addressed — no favicon asset exists yet).

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

## Backlog
- Enable branch protection on `main` (human, GitHub Settings → Branches) —
  still outstanding, no tool available to me to do this.

## Needs human playtest
- ~~Movement/collision/camera feel~~ — **confirmed by user 2026-07-14**:
  walking works, trees and water block correctly.
- On https://stevenseagalstreams.github.io/Ashes-of-azer/ (after the next
  `dev` deploy): **the full 0.2 overworld loop** vs. the prototype —
  - Combat feel: hold SPACE to attack (slash flashes toward facing),
    slimes/bats chase and hit for 6/5, die in ~3 swings, floating damage
    numbers (yellow = crit).
  - Fog: sight radius around you, plains fading to dark — should read like
    the prototype's overworld, no flicker/seams; check it holds 60fps and
    doesn't tank on weaker hardware (headless run measured ~59fps).
  - Death: let a monster kill you → "YOU DIED" → press R → back at spawn full
    hp. HP bar top-left.
  Known gaps, deliberate (owned by later milestones, not bugs): no XP/loot
  (0.3), no skills 1-5 (1.2), dungeon door inert / no dungeon (0.5).

## Asset requests
(none yet)
