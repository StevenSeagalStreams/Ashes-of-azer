# Changelog

## Unreleased
- **Items now change how your skills behave, not just their numbers** — the core
  of the game. Legendaries carry *skill mods*: the **Emberfall Signet** makes
  Fireball split into three, chain between enemies, *and* boomerang back to you;
  **Glacial Crown** makes Ice Shard pierce and deep-freeze; **Colossus Plate**
  widens Whirlwind and lengthens Shield Slam's stun; **Beastmaster Totem** adds
  arrows to Multi Shot and teeth to your wolf; and more — at least two per class.
- Legendaries can also trigger on events: **Frostheart** bursts slain foes in a
  frost nova, **Executioner's Edge** heals you on every kill, **Bloodmyre Band**
  sets your targets ablaze on hit. The skill panel's tooltips show the modified
  values, so you can see exactly what an item does to a skill.
- The **Hunter** is playable — a ranged skirmisher with 14 actives and 10
  passives. Loose **Quick Shot** and **Multi Shot** (a spreading fan of
  arrows), **Piercing Arrow**, **Chain Shot**, and the **Arrow Storm** ultimate;
  lay **Snare / Explosive / Frost traps** that arm and then detonate when an
  enemy steps in; summon a **Wolf** companion that hunts down your foes and can
  die and respawn; pop **Rapid Fire** for a burst of attack speed; and kite with
  **Disengage**, **Hunter's Mark**, and a raining **Volley**.
- Traps, pets, and multi-projectile fans are all new engine systems, so future
  classes and enemies can reuse them.
- A title menu now greets you on every launch: **Continue** picks up your
  saved character (it shows their class and level), and **New Game** opens the
  class picker. This means you can start a Mage even if you already have a
  Warrior save — New Game asks you to confirm before replacing it, and a Back
  button returns you to the menu.
- Pick your class when you start a new game — the picker offers the Warrior and
  the Mage (Hunter is coming soon).
- The Mage arrives with a full spellbook: 14 actives and 10 passives. Sling
  Arcane Bolt (a cheap primary), Fireball (burns), Ice Shard (chills), Chain
  Lightning, and Pyroblast; drop Flame Wall, Blizzard, and a telegraphed
  Meteor; blink away, freeze the room with Frost Nova, and top up with Arcane
  Pulse, Mana Shield, Hex, and Rejuvenate. The skill panel and hotbar now show
  only your own class's kit.
- Spells fly and linger: projectiles travel toward your cursor and can pierce,
  chain to nearby foes, and split on their first hit; ground effects burn or
  freeze anything standing in them. Fire leaves a damage-over-time burn and
  frost slows enemies down.
- Basic attacks now swing toward your mouse cursor — hold left-click (or SPACE)
  to attack, so you can move one way and strike another. Clicks on the skill
  panel and hotbar don't trigger an attack. Skills still fire in your movement
  direction.
- The Warrior's full kit — 14 active skills and 10 passives. New actives:
  Heroic Strike & Cleave (free primaries that restore mana), Charge (dash +
  stun), Ground Rend (bleed), Hammerfall, Iron Guard (damage reduction),
  Taunt (enemies take more damage), Second Wind (self-heal), and the
  Earthshatter ultimate. New passives: crit-vs-stunned, block, life steal,
  mana-on-kill, thorns, low-health berserk, cooldown reduction. Only 6
  actives + 6 passives equip at once, so builds diverge.
- Passive slots (bottom-right, purple) — learned passives slot themselves in;
  drag them between slots or drag one off the bar to disable it. A free
  RESPEC button in the K panel refunds every spent skill point.
- Passive skills! Toughness (+max life), Swiftness (+move speed) and Keen
  Edge (+crit) appear in the K panel from level 2-3 — learn them with skill
  points and they apply automatically, always-on.
- Build your own hotbar: drag any unlocked skill from the K panel onto a
  hotbar slot to rebind keys 1-6 — your layout is saved with your character.
- Skill panel and hotbar! Press K to open your skills, spend skill points
  (+ buttons) to learn Execute and War Cry or rank up your other skills. The
  hotbar at the bottom shows keys 1-6 with live cooldowns; a blue outline
  means not enough mana.
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
