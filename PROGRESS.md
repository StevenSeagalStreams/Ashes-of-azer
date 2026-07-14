# Progress — Ashes of Azer

## Current task
Milestone 0.2, next unchecked box: **"Port player movement + collision to
Phaser arcade physics."** This is the next session's starting point.

Notes for that session:
- Reference `ashes_of_azer.html` lines ~360-386 (player object, `pstats()`)
  and ~669-690 (the `update()` movement block: WASD → normalized velocity,
  `walkable()` tile-collision check, speed = `78 * (1 + ST.ms/100)`).
- There's no Tiled map yet (that's Milestone 0.5) — Tiled integration is a
  later checkbox, so for this task, either (a) stand up a minimal
  placeholder tilemap/bounds in `WorldScene` just to give arcade physics
  something to collide with, or (b) use a plain world-bounds rectangle for
  now and defer real tile collision to when Tiled lands. Use judgement;
  either is a "technical choice within the stated stack" CLAUDE.md says to
  decide solo — just record which one and why.
- Put the player as an entity under `/src/entities` (e.g. `Player.ts`) per
  the folder structure from 0.1, not inline in `WorldScene`.
- Camera follow is the *next* checkbox after this one — don't do it yet,
  even though it's tempting to wire up together with movement.

## Done
- **Milestone 0.1 — Project setup: 5 of 6 checkboxes complete** (deploy
  pipeline written but blocked on a human step — see Backlog).
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
  - GitHub Actions deploy (`.github/workflows/deploy.yml`) written, and CI
    steps within it (typecheck/lint/test/build) verified green on a real push
    to `dev`. The actual Pages publish step fails pending a one-time human
    setup step — checkbox left unticked. See Backlog for the exact error and
    fix.
  - `CHANGELOG.md` created with an `## Unreleased` heading.
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
  data-driven systems, per CLAUDE.md's verification rules.

## Backlog
- Enable branch protection on `main` (human, GitHub Settings → Branches).
- **GitHub Pages needs a one-time manual enable.** Confirmed by a real push to
  `dev`: `.github/workflows/deploy.yml` ran CI clean (typecheck/lint/test/build
  all passed) but the `actions/configure-pages@v5` step failed with
  `Create Pages site failed. Error: Resource not accessible by integration`.
  `enablement: true` can only deploy to an *already-enabled* Pages site — it
  can't turn Pages on for the first time; that's a repo-admin action the
  default `GITHUB_TOKEN` isn't allowed to do. Human action needed: repo
  Settings → Pages → set "Build and deployment source" to "GitHub Actions".
  After that one-time step, this workflow should succeed on the next push to
  `dev` with no changes needed on my end.

## Needs human playtest
- After enabling Pages (see Backlog), confirm the deploy workflow succeeds on
  the next push to `dev` and the published page actually loads and boots.
- Visually confirm the current placeholder boot screen ("Ashes of Azer" text
  on a dark background at 960×540) looks right — no visual regressions
  expected until Milestone 0.2 replaces it with real gameplay.

## Asset requests
(none yet)
