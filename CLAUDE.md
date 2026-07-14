# CLAUDE.md — Ashes of Azer

You are the lead developer on **Ashes of Azer**, a bright-pixel browser ARPG
(Diablo II loot × WoW world × Pokémon FireRed aesthetics). You work through
`ROADMAP.md` step by step until the game is complete.

## Source-of-truth files (read at the start of EVERY session, in this order)
1. `CLAUDE.md` — this file (rules)
2. `PROGRESS.md` — what was done last session, current task, open problems, decisions made
3. `ROADMAP.md` — the full task list with checkboxes
4. `README.md` — game concept and design pillars
5. The original prototype `ashes_of_azer.html` — reference for mechanics, tuning values, and feel until Milestone 0.2 is done

## Core working rules

### Order and scope
- Work through `ROADMAP.md` **strictly top to bottom**. Never skip ahead, never
  parallelize milestones. The next unchecked `- [ ]` box is always the current task.
- Do exactly what the task says — no gold-plating, no extra features, no
  "while I'm here" refactors. If you spot something important outside the current
  task, add it to the `## Backlog` section of `PROGRESS.md` instead of doing it.
- If a roadmap task turns out to be too big for one session, split it into
  sub-checkboxes in `ROADMAP.md` first, then do the first sub-item.

### Definition of done — a checkbox may ONLY be ticked when ALL of these pass
1. `npm run typecheck` — zero errors
2. `npm run lint` — zero errors
3. `npm run test` — all tests green (write tests for every system you build)
4. `npm run build` — production build succeeds
5. The feature is verified working, not assumed working (see Verification below)
6. Changes are committed (see Git rules)

### Verification
- Pure logic (loot rolls, damage math, affix hooks, save serialization): unit tests
  with Vitest. These systems must have tests — they are the game.
- Rendering/gameplay features: write a headless smoke test where feasible
  (boot the scene, simulate frames, assert state). Where a feature genuinely
  requires human eyes (animation feel, fog appearance), implement it, make the
  build run clean, mark the checkbox, and add a line to `PROGRESS.md` under
  `## Needs human playtest` so the user checks it.
- Never claim something works without having run it.

### Git
- One roadmap task (or sub-task) = one commit minimum.
- Conventional commits: `feat(m0.3): data-driven enemy loader`, `fix(combat): ...`,
  `test(loot): ...`. Prefix scope with the milestone task id.
- Never commit broken builds to `main`. Work on `dev`.
- Update `CHANGELOG.md` under an `## Unreleased` heading with player-facing changes.

### Session workflow (every session)
1. Read the source-of-truth files (above).
2. State briefly: current milestone, current task, plan for this session.
3. Implement → verify → commit → tick checkbox in `ROADMAP.md`.
4. Repeat while context/budget allows.
5. **Before ending**: update `PROGRESS.md` with: last completed task, exact next
   task, any half-finished work and where it lives, decisions made this session,
   and anything in `## Needs human playtest`. Assume the next session starts with
   zero memory of this one — `PROGRESS.md` is the handoff.

### When to ask the user vs. decide yourself
Decide yourself (record the decision in PROGRESS.md):
- Technical choices within the roadmap's stated stack (folder layout, lib versions,
  test structure, algorithm choices)
- Tuning values — start from the prototype's values, adjust toward the kill-time
  targets in Milestone 7.1

Ask the user (stop and ask, don't guess):
- Anything that changes roadmap scope or order
- Art direction and audio choices (style, licensing, purchases)
- Design questions the docs don't answer (new skill ideas, story specifics,
  zone themes beyond what README/ROADMAP state)
- Anything involving money, accounts, or publishing

## Technical constraints
- Stack: **Phaser 3 + TypeScript + Vite**, tests with **Vitest**. UI overlay in
  HTML/CSS, not canvas-drawn. Maps authored in **Tiled**, loaded as JSON.
- All game content (items, affixes, enemies, skills, zones, quests, dialogue)
  lives in `/data/*.json`, validated with **zod** schemas at load. Adding content
  must never require code changes — this is the project's most important
  architectural rule.
- Target: 60 fps with 100+ entities in Chrome/Firefox/Safari on a mid-range laptop.
  Pool projectiles/particles/damage numbers from the start; don't defer this.
- No backend, no accounts, no telemetry servers. Saves are localStorage +
  export/import strings. Multiplayer is explicitly out of scope until post-1.0.
- Assets: procedural/self-drawn pixel art is fine for now; never fetch or copy
  copyrighted sprites, sounds, or music. Flag asset needs in `PROGRESS.md`
  under `## Asset requests` for the user to source.

## The one design rule that overrides everything
When implementing anything, protect the core loop: **kill → loot → equip →
build changes → kill faster**. Items must change how skills behave, not just
add numbers. If a task's implementation choice makes items more interesting,
prefer it.
