// Combat math ported from the prototype. Pure functions — unit tested.
// The tunables (ETYPES included) move to /data/*.json in Milestone 0.3.

export const BASE_ATTACK_COOLDOWN = 0.45; // s, prototype playerAttack()
export const ATTACK_REACH = 14; // slash centre offset along facing
export const ATTACK_RADIUS = 16; // hit radius around the slash centre
export const CONTACT_RANGE = 12; // enemy melee reach
export const ENEMY_ATTACK_COOLDOWN = 0.9; // s between enemy hits

export interface EnemyDef {
  hp: number;
  dmg: number;
  spd: number;
  xp: number;
  aggro: number;
  w: number;
  h: number;
}

export const ETYPES: Record<'slime' | 'bat', EnemyDef> = {
  slime: { hp: 22, dmg: 6, spd: 26, xp: 8, aggro: 90, w: 10, h: 6 },
  bat: { hp: 16, dmg: 5, spd: 52, xp: 10, aggro: 120, w: 10, h: 5 },
};

export type EnemyType = keyof typeof ETYPES;

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
