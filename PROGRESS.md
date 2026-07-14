# Progress — Ashes of Azer

## Current task
Milestone 0.1 — Project setup. Scaffolding Vite + TypeScript + Phaser 3.

## Done
- `dev` branch created on GitHub (points at `main`).

## Decisions
- Branch protection on `main` could not be configured: no branch-protection tool
  is exposed by the GitHub MCP server available in this session. Left for the
  human to enable in repo Settings → Branches (require PR review before merge).
- Scaffolding the Vite project by hand (package.json/tsconfig/vite.config.ts)
  rather than running the interactive `npm create vite@latest` CLI, since the
  repo already has files at root (README.md, ROADMAP.md, CLAUDE.md, the
  prototype) and the CLI's non-empty-directory prompt can't be answered
  non-interactively. End result is equivalent: Vite + TypeScript + Phaser 3.
- Deploy pipeline (0.1 last item) will target GitHub Pages, not itch.io —
  GitHub Pages needs no new account/credentials; itch.io publishing needs a
  butler API key, which falls under CLAUDE.md's "ask before money/accounts"
  rule. Will confirm with the user before that sub-task if itch.io is wanted
  instead/also.

## Backlog
- Enable branch protection on `main` (human, GitHub Settings).

## Needs human playtest
(none yet)

## Asset requests
(none yet)
