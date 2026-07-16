// Combat math ported from the prototype. Pure functions — unit tested.
// Enemy stats live in data/enemies.json (Milestone 0.3) — see
// src/data/gameData.ts for the loader and src/entities/Enemy.ts for how
// they're consumed. Nothing enemy-stat-shaped is hardcoded here anymore.

export const BASE_ATTACK_COOLDOWN = 0.45; // s, prototype playerAttack()
export const ATTACK_REACH = 14; // slash centre offset along facing
export const ATTACK_RADIUS = 16; // hit radius around the slash centre
export const CONTACT_RANGE = 12; // enemy melee reach
export const ENEMY_ATTACK_COOLDOWN = 0.9; // s between enemy hits

export const attackCooldown = (aspdPct: number): number =>
  BASE_ATTACK_COOLDOWN / (1 + aspdPct / 100);

// Prototype pstats(): dmg = 8 + level*2 (before weapon/affixes — gear lands in 0.3)
export const playerBaseDamage = (level: number): number => 8 + level * 2;

// Prototype spawnEnemy(): hp scales with player level
export const scaledEnemyHp = (base: number, playerLevel: number): number =>
  base * (1 + playerLevel * 0.12);

export interface HitResult {
  amount: number;
  crit: boolean;
}

export const rollHit = (
  base: number,
  critPct: number,
  rng: () => number = Math.random,
): HitResult => {
  const crit = rng() * 100 < critPct;
  return { amount: Math.round(crit ? base * 2 : base), crit };
};
