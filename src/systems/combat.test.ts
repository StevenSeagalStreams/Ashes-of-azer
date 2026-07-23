import { describe, expect, it } from 'vitest';
import { attackCooldown, BASE_ATTACK_COOLDOWN, playerBaseDamage, rollHit, scaledEnemyHp } from './combat.ts';

describe('attackCooldown', () => {
  it('is the prototype base with no attack speed', () => {
    expect(attackCooldown(0)).toBe(BASE_ATTACK_COOLDOWN);
  });

  it('shrinks with +attack speed', () => {
    expect(attackCooldown(25)).toBeCloseTo(0.45 / 1.25);
    expect(attackCooldown(100)).toBeCloseTo(0.225);
  });
});

describe('playerBaseDamage', () => {
  it('matches the prototype formula 8 + level*2', () => {
    expect(playerBaseDamage(1)).toBe(10);
    expect(playerBaseDamage(5)).toBe(18);
  });
});

describe('scaledEnemyHp', () => {
  it('scales prototype base hp by player level', () => {
    // Values from data/enemies.json (slime hp:22, bat hp:16), not hardcoded here.
    expect(scaledEnemyHp(22, 1)).toBeCloseTo(22 * 1.12);
    expect(scaledEnemyHp(16, 3)).toBeCloseTo(16 * 1.36);
  });
});

describe('rollHit', () => {
  it('doubles damage on crit', () => {
    const crit = rollHit(10, 5, () => 0.01); // 1 < 5 → crit
    expect(crit).toEqual({ amount: 20, crit: true });
  });

  it('deals base damage otherwise', () => {
    const normal = rollHit(10, 5, () => 0.99); // 99 >= 5 → no crit
    expect(normal).toEqual({ amount: 10, crit: false });
  });

  it('rounds the result', () => {
    expect(rollHit(7.4, 0, () => 0.99).amount).toBe(7);
  });

  it('never crits at 0% and always crits at 100%', () => {
    expect(rollHit(10, 0, () => 0).crit).toBe(false);
    expect(rollHit(10, 100, () => 0.999).crit).toBe(true);
  });
});
