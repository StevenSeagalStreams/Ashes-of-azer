# Ashes of Azer

**A bright-pixel action RPG where the loot changes how you play — not just how hard you hit.**

Centuries ago, the Titans sealed six ancient gods inside relics. The kingdoms turned those relics into symbols of power. Now the relics are awakening — and every legendary item you find carries a piece of that corruption. Collecting relic fragments makes you stronger, but slowly warps the world around you: NPCs change, cities change, enemies evolve. In the end, you choose — destroy the relics, control them, or become the final god.

## The pitch

Imagine the loot chase of **Diablo II**, the living zones and progression of **World of Warcraft**, and the bright, readable, tile-based charm of **Pokémon FireRed** — in one browser game. Instead of pixel-dark grimdark, the world uses cheerful GBA-era colors while hiding surprisingly deep systems underneath.

## Design pillars

- **Deep randomized loot** — 6 rarities (White → Mythic), Diablo-style affixes that alter mechanics: *Frozen enemies explode*, *Critical Hits poison*, *Gain Mana on Kill*, *+Vision* (pushes back the fog of war)
- **Build-defining legendaries** — every legendary grants a unique power that becomes the core of a build (Frostheart, Thornroot Boots, Crown of the First King)
- **Compact build system** — ~25 skills per class, but only 6 active + 6 passive equipped. Items modify skills, so builds emerge from item/skill interactions rather than giant talent trees
- **Real-time combat** — Diablo movement, WoW cooldowns, Zelda readability
- **A living world** — zone progression (Starter Plains → Ancient Void), towns, factions, world bosses, and a corruption system that visibly changes the world as you collect relic fragments
- **Endgame loop** — nightmare levels, daily contracts, randomized dungeons, seasonal events, mythic item farming

The player should always feel they're **one item away from a stronger build**.

## Current prototype

A playable vertical slice in a single self-contained HTML file — vanilla JS/Canvas, zero dependencies, runs offline in any browser.

**Implemented:**

- Two zones: **Starter Plains** (overworld with healing well and respawning enemies) and **Hollow Barrow** (dungeon with a mini-boss that guarantees a legendary drop)
- Real-time warrior combat: primary attack + 5 rankable skills (Shield Slam, Whirlwind, Leap, Execute, War Cry) with cooldowns, mana, and cooldown reduction
- **Skill system**: 1 skill point per level, each skill upgradable to rank 5 with real scaling (damage, radius, stun duration, execute threshold)
- **Loot system**: 5 rarities with D2-style drop distribution, 10+ affixes including frost (chill + freeze), life steal, poison-on-crit, mana-on-kill, and Vision
- **Three working legendary powers**: Frostheart (frozen enemies explode in chains), Thornroot Boots (movement leaves damaging vines), Crown of the First King (every third attack summons a ghost knight strike)
- **Fog of war**: limited sight radius — tighter in dungeons — extendable through +Vision gear, making vision itself part of the itemization
- Inventory with tooltips, equipment slots, derived stats panel, XP/levels, floating damage numbers, and GBA-bright procedural pixel art

**Controls:** WASD to move · SPACE to attack · 1–5 skills · K skill tree · I inventory · E pick up

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full milestone-by-milestone development checklist, from technical foundation through 1.0 release.

- More classes (Mage, Hunter) with generator/spender/ultimate kits
- Walk animations, sound, and juicier hit feedback
- Crafting, sockets, and vendor/repair loop in town
- Save system (local first, cloud profiles later)
- The corruption system: world state that shifts as relic fragments are collected
- Further zones, factions, quest chains, and world bosses
- Optional later: 4-player co-op, trading, seasonal ladders

## Tech

- **Now:** single-file HTML5 Canvas prototype, data-driven items/affixes/enemies in plain JS objects
- **Planned:** Phaser 3 + TypeScript, JSON-driven content, HTML/CSS overlay UI, 32×32 sprites with layered lighting
- **Target session:** 15–30 minute dungeon runs with long-term character progression

---

*Prototype: open `ashes_of_azer.html` in a browser and play.*
