// Corruption — the risk dial (Milestone 3 prototype). Pure + unit-tested; the
// scene owns the side effects (scaling spawns, biasing loot, cleansing at wells).
//
// The fantasy (decided with the user): corruption is a global 0–100 value the
// player pushes up by *fighting* — every kill raises it, bosses much more. Higher
// corruption spawns tougher enemies (more HP, more damage) but drops more and
// better loot. Heal wells cleanse it. Push your luck: fight deep for the good
// drops, or retreat to town to bleed the risk back down.
//
// (Roadmap §3 originally had corruption "driven by relic fragments collected";
// per the user this driver is kills, and relics stay collectibles. The tier
// table lives here as tuning, not content — easy to move to data/ later.)

export interface CorruptionTier {
  threshold: number; // corruption at/above which this tier applies
  name: string;
  enemyHpMult: number; // spawn HP scale
  enemyDmgMult: number; // damage-dealt scale
  dropChanceAdd: number; // added to a normal enemy's drop chance
  rarityBonus: number; // loot "luck": extra rarity rolls, best wins
}

// Authored low→high; index 0 is the base tier (threshold 0).
export const CORRUPTION_TIERS: readonly CorruptionTier[] = [
  { threshold: 0, name: 'Pure', enemyHpMult: 1.0, enemyDmgMult: 1.0, dropChanceAdd: 0.0, rarityBonus: 0 },
  { threshold: 25, name: 'Tainted', enemyHpMult: 1.25, enemyDmgMult: 1.1, dropChanceAdd: 0.12, rarityBonus: 1 },
  { threshold: 50, name: 'Corrupt', enemyHpMult: 1.6, enemyDmgMult: 1.25, dropChanceAdd: 0.25, rarityBonus: 2 },
  { threshold: 75, name: 'Defiled', enemyHpMult: 2.1, enemyDmgMult: 1.5, dropChanceAdd: 0.4, rarityBonus: 3 },
  { threshold: 100, name: 'Abyssal', enemyHpMult: 2.8, enemyDmgMult: 1.8, dropChanceAdd: 0.55, rarityBonus: 4 },
];

export const CORRUPTION_PER_KILL = 1.5; // a normal kill nudges corruption up
export const CORRUPTION_PER_BOSS = 8; // a boss kill spikes it
export const CORRUPTION_CLEANSE_RATE = 12; // corruption/sec bled off at a heal well
export const CORRUPTION_MAX = 100;

/** The active tier for a corruption value (the highest whose threshold it meets). */
export function corruptionTier(corruption: number): CorruptionTier {
  let tier = CORRUPTION_TIERS[0]!;
  for (const t of CORRUPTION_TIERS) if (corruption >= t.threshold && t.threshold >= tier.threshold) tier = t;
  return tier;
}

/** Clamps a corruption value into [0, 100]. */
export const clampCorruption = (c: number): number => Math.max(0, Math.min(CORRUPTION_MAX, c));

/** Corruption after a kill (boss kills spike harder). */
export const gainCorruption = (corruption: number, boss: boolean): number =>
  clampCorruption(corruption + (boss ? CORRUPTION_PER_BOSS : CORRUPTION_PER_KILL));

/** Corruption after `dt` seconds of cleansing at a well. */
export const cleanseCorruption = (corruption: number, dt: number): number =>
  clampCorruption(corruption - CORRUPTION_CLEANSE_RATE * dt);
