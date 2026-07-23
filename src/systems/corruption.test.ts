import { describe, expect, it } from 'vitest';
import {
  cleanseCorruption,
  clampCorruption,
  corruptionTier,
  gainCorruption,
  CORRUPTION_PER_BOSS,
  CORRUPTION_PER_KILL,
} from './corruption.ts';

describe('corruptionTier', () => {
  it('returns the highest tier the value has reached', () => {
    expect(corruptionTier(0).name).toBe('Pure');
    expect(corruptionTier(24).name).toBe('Pure');
    expect(corruptionTier(25).name).toBe('Tainted');
    expect(corruptionTier(60).name).toBe('Corrupt');
    expect(corruptionTier(100).name).toBe('Abyssal');
  });

  it('higher tiers are strictly nastier and more rewarding', () => {
    const pure = corruptionTier(0);
    const abyssal = corruptionTier(100);
    expect(abyssal.enemyHpMult).toBeGreaterThan(pure.enemyHpMult);
    expect(abyssal.enemyDmgMult).toBeGreaterThan(pure.enemyDmgMult);
    expect(abyssal.dropChanceAdd).toBeGreaterThan(pure.dropChanceAdd);
    expect(abyssal.rarityBonus).toBeGreaterThan(pure.rarityBonus);
  });
});

describe('gainCorruption', () => {
  it('a kill raises corruption; a boss raises it more', () => {
    expect(gainCorruption(0, false)).toBe(CORRUPTION_PER_KILL);
    expect(gainCorruption(0, true)).toBe(CORRUPTION_PER_BOSS);
  });

  it('never exceeds 100', () => {
    expect(gainCorruption(99, true)).toBe(100);
  });
});

describe('cleanseCorruption', () => {
  it('bleeds corruption down over time, never below 0', () => {
    expect(cleanseCorruption(50, 1)).toBe(38); // 50 - 12
    expect(cleanseCorruption(5, 1)).toBe(0); // clamped
  });
});

describe('clampCorruption', () => {
  it('clamps into [0, 100]', () => {
    expect(clampCorruption(-5)).toBe(0);
    expect(clampCorruption(150)).toBe(100);
    expect(clampCorruption(42)).toBe(42);
  });
});
