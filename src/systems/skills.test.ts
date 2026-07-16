import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import {
  applyXp,
  availableSkillPoints,
  castBlock,
  manaMaxFor,
  rankOf,
  scaleValue,
  skillCooldown,
  xpToNext,
} from './skills.ts';

const skills = loadGameData().skills;
const byId = (id: string) => {
  const s = skills.find((s) => s.id === id);
  if (!s) throw new Error(`missing skill ${id}`);
  return s;
};

describe('xpToNext', () => {
  it('matches the prototype chain (40, then ×1.5 rounded)', () => {
    expect(xpToNext(1)).toBe(40);
    expect(xpToNext(2)).toBe(60);
    expect(xpToNext(3)).toBe(90);
    expect(xpToNext(4)).toBe(135);
    expect(xpToNext(5)).toBe(203); // round(135*1.5)
  });
});

describe('applyXp', () => {
  it('accumulates without levelling below the threshold', () => {
    expect(applyXp({ level: 1, xp: 0 }, 39)).toEqual({ level: 1, xp: 39, levelsGained: 0 });
  });

  it('levels up and carries the remainder', () => {
    expect(applyXp({ level: 1, xp: 30 }, 20)).toEqual({ level: 2, xp: 10, levelsGained: 1 });
  });

  it('handles multi-level gains in one award', () => {
    // 40 + 60 = 100 to reach level 3 from fresh.
    expect(applyXp({ level: 1, xp: 0 }, 105)).toEqual({ level: 3, xp: 5, levelsGained: 2 });
  });
});

describe('scaleValue / skillCooldown / manaMaxFor', () => {
  it('scales linearly with rank (prototype formulas)', () => {
    const slam = byId('shield_slam');
    if (slam.mechanic !== 'shockwave') throw new Error('unexpected mechanic');
    expect(scaleValue(slam.radius, 1)).toBe(43); // 40 + 3*1
    expect(scaleValue(slam.damageMultiplier, 5)).toBeCloseTo(2.5); // 1 + 0.3*5
  });

  it('applies cooldown reduction with the prototype 60% cap', () => {
    expect(skillCooldown(8, 0)).toBe(8);
    expect(skillCooldown(8, 25)).toBe(6);
    expect(skillCooldown(8, 90)).toBeCloseTo(3.2); // capped at 60
  });

  it('computes mana like the prototype', () => {
    expect(manaMaxFor(1)).toBe(55);
    expect(manaMaxFor(10)).toBe(100);
  });
});

describe('rankOf / availableSkillPoints', () => {
  it('falls back to the free starting rank', () => {
    expect(rankOf(byId('shield_slam'), {})).toBe(1);
    expect(rankOf(byId('execute'), {})).toBe(0);
    expect(rankOf(byId('execute'), { execute: 2 })).toBe(2);
  });

  it('derives points as earned minus spent-beyond-starting-rank', () => {
    expect(availableSkillPoints(1, skills, {})).toBe(0);
    expect(availableSkillPoints(4, skills, {})).toBe(3);
    expect(availableSkillPoints(4, skills, { shield_slam: 2, execute: 1 })).toBe(1); // spent 1+1
  });
});

describe('castBlock', () => {
  const warCry = byId('war_cry'); // unlocks at 5

  it('blocks in priority order: locked, unlearned, cooldown, mana', () => {
    expect(castBlock(warCry, { level: 1, rank: 0, mp: 100, cooldownRemaining: 0 })).toBe('locked');
    expect(castBlock(warCry, { level: 5, rank: 0, mp: 100, cooldownRemaining: 0 })).toBe('unlearned');
    expect(castBlock(warCry, { level: 5, rank: 1, mp: 100, cooldownRemaining: 2 })).toBe('cooldown');
    expect(castBlock(warCry, { level: 5, rank: 1, mp: 3, cooldownRemaining: 0 })).toBe('mana');
    expect(castBlock(warCry, { level: 5, rank: 1, mp: 100, cooldownRemaining: 0 })).toBeNull();
  });
});
