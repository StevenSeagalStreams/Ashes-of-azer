# Progress — Ashes of Azer

## Current task
Milestone 0.1 is complete. Next up: Milestone 0.2 — port the prototype into
Phaser scenes (`BootScene`, `WorldScene`, `UIScene`; movement/collision;
camera follow; combat core; fog of war; verify parity with the HTML prototype).

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
  - GitHub Actions deploy (`.github/workflows/deploy.yml`): builds and
    publishes to GitHub Pages on push to `dev`, using
    `actions/configure-pages` with `enablement: true` so it self-enables
    Pages on first run. **Not yet verified against a real push** — this
    session pushes to `claude/ashes-azer-roadmap-gxp6wu`, not `dev`, so the
    workflow hasn't fired yet. See Needs human playtest.
  - `CHANGELOG.md` created with an `## Unreleased` heading.

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
- Confirm the GitHub Pages deploy workflow actually succeeds on a real push
  to `dev` (first run needs Pages permission on the token, which
  `configure-pages`'s `enablement: true` should self-serve, but hasn't been
  observed running for real yet).

## Needs human playtest
- Once this branch is merged and something lands on `dev`, check that the
  GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) actually
  publishes and the page loads.
- Visually confirm the current placeholder boot screen ("Ashes of Azer" text
  on a dark background at 960×540) looks right — no visual regressions
  expected until Milestone 0.2 replaces it with real gameplay.

## Asset requests
(none yet)
