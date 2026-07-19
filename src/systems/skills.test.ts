import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import {
  applyXp,
  assignSlot,
  passiveModifiers,
  describeSkill,
  availableSkillPoints,
  castBlock,
  defaultActives,
  manaMaxFor,
  rankOf,
  resolveLoadout,
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

describe('loadout helpers', () => {
  it('defaultActives fills 6 slots with the first six ACTIVE skills (no passives)', () => {
    const bar = defaultActives(skills);
    expect(bar).toHaveLength(6);
    expect(bar.every((id) => id !== null)).toBe(true);
    for (const id of bar) {
      expect(byId(id as string).mechanic).not.toBe('passive');
    }
    expect(bar.slice(0, 5)).toEqual(['shield_slam', 'whirlwind', 'leap', 'execute', 'war_cry']);
  });

  it('resolveLoadout maps ids to defs and unknown ids to empty', () => {
    const resolved = resolveLoadout(['leap', 'ghost_skill', null, null, null, null], skills);
    expect(resolved[0]?.id).toBe('leap');
    expect(resolved[1]).toBeNull();
    expect(resolved).toHaveLength(6);
  });

  it('assignSlot places a skill and swaps when already slotted elsewhere', () => {
    const base = ['shield_slam', 'whirlwind', null, null, null, null];
    expect(assignSlot(base, 2, 'execute')).toEqual(['shield_slam', 'whirlwind', 'execute', null, null, null]);
    // Moving whirlwind onto slot 0 swaps shield_slam into slot 1.
    expect(assignSlot(base, 0, 'whirlwind')).toEqual(['whirlwind', 'shield_slam', null, null, null, null]);
    expect(assignSlot(base, 1, null)).toEqual(['shield_slam', null, null, null, null, null]);
    expect(base).toEqual(['shield_slam', 'whirlwind', null, null, null, null]); // pure
  });
});

describe('passives', () => {
  it('sums modifiers of slotted, learned passives only', () => {
    const ranks = { toughness: 2, keen_edge: 1 };
    // keen_edge learned but NOT slotted; swiftness slotted but unlearned.
    const mods = passiveModifiers(skills, ranks, ['toughness', 'swiftness', null, null, null, null]);
    expect(mods.maxHpPct).toBe(10); // 5%/rank * 2
    expect(mods.critPct).toBeUndefined();
    expect(mods.moveSpeedPct).toBeUndefined();
  });

  it('describes a passive at rank', () => {
    expect(describeSkill(byId('toughness'), 3)).toBe('Passive: +15% Max Life');
  });

  it('never allows casting a passive', () => {
    expect(castBlock(byId('toughness'), { level: 99, rank: 5, mp: 999, cooldownRemaining: 0 })).toBe('unlearned');
  });

  it('defaultActives excludes passives', () => {
    expect(defaultActives(skills)).not.toContain('toughness');
  });
});

describe('warrior kit content', () => {
  it('has 14 actives and 10 passives', () => {
    expect(skills.filter((s) => s.mechanic !== 'passive')).toHaveLength(14);
    expect(skills.filter((s) => s.mechanic === 'passive')).toHaveLength(10);
  });

  it('describes each new mechanic without throwing', () => {
    for (const id of ['heroic_strike', 'charge', 'ground_rend', 'taunt', 'second_wind', 'iron_guard']) {
      expect(describeSkill(byId(id), 1)).toBeTruthy();
    }
  });

  it('Ground Rend describes its bleed; Iron Guard its damage reduction', () => {
    expect(describeSkill(byId('ground_rend'), 1)).toMatch(/bleed/i);
    expect(describeSkill(byId('iron_guard'), 1)).toMatch(/damage reduction/i);
  });

  it('sums conditional passive stats like any other modifier', () => {
    const mods = passiveModifiers(skills, { blood_pact: 3, spiked_armor: 2 }, ['blood_pact', 'spiked_armor', null, null, null, null]);
    expect(mods.lifestealPct).toBe(6); // 2%/rank * 3
    expect(mods.thornsPct).toBe(16); // 8%/rank * 2
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
