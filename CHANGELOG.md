# Changelog

## Unreleased
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
