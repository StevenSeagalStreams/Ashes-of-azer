# Progress — Ashes of Azer

## Current task
Milestone 0.2, next unchecked box: **"Port the combat core: hit detection,
damage numbers, cooldowns."** This is the next session's starting point.

Notes for that session:
- Reference `ashes_of_azer.html`: `playerAttack()` (~line 507), `dmgEnemy()`
  (~462), `shockwave()` (~504), the fx damage-number system (~454-460 and the
  render block ~867), skill cooldown handling in `trySkill()` (~642) and the
  per-frame cooldown tick in `update()` (~691).
- Combat needs something to hit: port the enemy spawn/chase basics only as
  far as needed to verify hit detection (ETYPES ~424, spawnEnemy/populate
  ~430-449, chase movement in update ~714-745). Full data-driven enemies come
  in 0.3 — keep the port minimal and hardcoded-matching-prototype for parity.
- Damage numbers: CLAUDE.md requires pooling from the start — pool the
  floating-text objects (and any hit particles) rather than allocating per hit.
- Cooldowns: prototype skills have cd/mana/rank; for *this* checkbox only the
  cooldown/attack-timing mechanics need porting (atkCd 0.45s / aspd), not the
  full 5-skill kit (that's Milestone 1.2's job).
- The scene runs at 480x270 zoom 2 — all prototype pixel values carry over 1:1.

## Done
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
- On https://stevenseagalstreams.github.io/Ashes-of-azer/ (after the next
  `dev` deploy): walk around Starter Plains with WASD/arrows. Check movement
  *feel* vs. the prototype (`ashes_of_azer.html`) — same speed, diagonals not
  faster, trees/water/border blocking cleanly, camera follow smooth. Headless
  tests verified the numbers; feel needs human hands.

## Asset requests
(none yet)
