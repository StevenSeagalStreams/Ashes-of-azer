// Elite / champion enemy modifiers (Milestone 4.x, D2-style rare monsters). A
// fraction of spawned enemies roll an "elite" affix: a coloured aura, boosted
// HP/damage/speed, sometimes a special behaviour, and a mini-boss loot reward.
// Pure + testable; the scene applies the picked modifier when it spawns an enemy.

export type Rng = () => number;

export interface EliteMod {
  id: string;
  name: string; // prefixes the enemy name ("Swift Sporeling")
  tint: number; // aura tint (hex)
  hpMult: number;
  dmgMult: number;
  spdMult: number;
  // Optional behaviours, layered onto the enemy def by the scene:
  poison?: { dps: number; duration: number }; // Venomous: poison-touch on hit
  summoner?: boolean; // Summoner: calls the zone's weakest foe periodically
  volatile?: { damage: number; radius: number }; // Volatile: bursts on death
}

// The affix table. Values are tuned so an elite is a real spike (a mini-boss you
// meet in the open), not a one-shot. Weights are equal for now.
export const ELITE_MODS: readonly EliteMod[] = [
  { id: 'swift', name: 'Swift', tint: 0x7fd0ff, hpMult: 1.4, dmgMult: 1.1, spdMult: 1.7 },
  { id: 'brutal', name: 'Brutal', tint: 0xff6a5a, hpMult: 1.6, dmgMult: 1.8, spdMult: 1.0 },
  { id: 'ironhide', name: 'Ironhide', tint: 0xb0b0c0, hpMult: 3.2, dmgMult: 1.2, spdMult: 0.9 },
  { id: 'venomous', name: 'Venomous', tint: 0x8bd06a, hpMult: 1.5, dmgMult: 1.1, spdMult: 1.1, poison: { dps: 8, duration: 3 } },
  { id: 'volatile', name: 'Volatile', tint: 0xff9a3d, hpMult: 1.5, dmgMult: 1.1, spdMult: 1.1, volatile: { damage: 40, radius: 62 } },
  { id: 'summoner', name: 'Summoner', tint: 0xc88af5, hpMult: 1.8, dmgMult: 1.0, spdMult: 0.9, summoner: true },
];

/** Fraction of eligible (non-boss) spawns that become elite. */
export const ELITE_CHANCE = 0.07;

/**
 * Rolls whether a spawn is elite and which affix it gets. Returns null the vast
 * majority of the time. `chance` is exposed for tests / corruption tuning.
 */
export function rollElite(rng: Rng, chance: number = ELITE_CHANCE): EliteMod | null {
  if (rng() >= chance) return null;
  const i = Math.min(ELITE_MODS.length - 1, Math.floor(rng() * ELITE_MODS.length));
  return ELITE_MODS[i] ?? null;
}
