# Changelog

## Unreleased
- Skills are live! Press 1 (Shield Slam — AoE + stun), 2 (Whirlwind), 3
  (Leap) in combat — they cost mana (blue bar, regenerates), have cooldowns,
  and scale with rank. Execute (4) and War Cry (5) exist but must be learned
  with skill points once the skill panel arrives.
- Monsters now grant XP — fill the green bar to level up: full heal, more
  health and mana, and a skill point per level (spending UI coming next).
- The Hollow Barrow is open! Walk through the dark doorway east of the plains
  to enter the dungeon — skeletons and bats lurk in tight, dark corridors,
  and ROTFANG, BARROW TYRANT waits in the far room with a ground-slam attack.
  A glowing portal leads back home, and the game remembers which zone you
  were in when you return.
- The healing well near the spawn now works — stand close to recover health.
- Maps are now hand-editable files (Tiled editor format) instead of
  code-generated, so world layouts can be redesigned without programming.
- Your progress now saves automatically (every 60 seconds) and survives
  closing or refreshing the browser. Saves can also be exported as a text
  string and imported on another machine.
- All game content (enemies, items, affixes, skills, zones) now lives in
  editable JSON data files instead of code (internal — no visible change;
  this is what lets future content updates ship without touching code).
- Phaser build: you can die now — run out of health and a "YOU DIED" screen
  appears; press R to rise again at the spawn. A health bar sits top-left, and
  the plains keep repopulating with monsters so there's always a fight nearby.
- Phaser build: fog of war — you only see a radius around yourself, the rest of
  Starter Plains fades into darkness. (Dungeons will be tighter; +Vision gear
  will push it back once loot lands.)
- Phaser build: combat! Slimes and bats roam Starter Plains, chase you on
  sight and bite back. Attack with SPACE — floating damage numbers, yellow
  crits, attack cooldown, enemy hp bars.
- Phaser build: walk around Starter Plains with WASD/arrows — trees, water and
  the map border block movement, matching the prototype's speed and feel.
- Project scaffolded on Vite + TypeScript + Phaser 3 (internal — no player-facing
  change yet; the HTML prototype is still the playable build until Milestone 0.2
  reaches feature parity).
