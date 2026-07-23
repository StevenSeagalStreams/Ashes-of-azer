import { describe, expect, it } from 'vitest';
import {
  cleanseCorruption,
  clampCorruption,
  corruptedEnemy,
  corruptionTier,
  gainCorruption,
  npcVisibleAtCorruption,
  CORRUPTION_PER_BOSS,
  CORRUPTION_PER_KILL,
} from './corruption.ts';
import type { EnemyData, NpcData } from '../data/schemas/index.ts';

describe('corruptionTier', () => {
  it('returns the highest tier the value has reached', () => {
    expect(corruptionTier(0).name).toBe('Pure');
    expect(corruptionTier(24).name).toBe('Pure');
    expect(corruptionTier(25).name).toBe('Tainted');
    expect(corruptionTier(60).name).toBe('Corrupt');
    expect(corruptionTier(100).name).toBe('Abyssal');
  });

  it('higher tiers are strictly nastier, more rewarding, and more ominous', () => {
    const pure = corruptionTier(0);
    const abyssal = corruptionTier(100);
    expect(abyssal.enemyHpMult).toBeGreaterThan(pure.enemyHpMult);
    expect(abyssal.enemyDmgMult).toBeGreaterThan(pure.enemyDmgMult);
    expect(abyssal.dropChanceAdd).toBeGreaterThan(pure.dropChanceAdd);
    expect(abyssal.rarityBonus).toBeGreaterThan(pure.rarityBonus);
    // Ambience ramps with the tier; the base tier is visually clean.
    expect(pure.overlayAlpha).toBe(0);
    expect(pure.emberRate).toBe(0);
    expect(abyssal.overlayAlpha).toBeGreaterThan(pure.overlayAlpha);
    expect(abyssal.emberRate).toBeGreaterThan(pure.emberRate);
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

describe('npcVisibleAtCorruption', () => {
  const npc = (extra: Partial<NpcData>): NpcData => ({
    id: 'n', name: 'N', sprite: 's', zone: 'town', x: 0, y: 0, dialogue: 'd', wander: false, offersQuests: [], prop: false, ...extra,
  });

  it('a plain NPC is always present', () => {
    expect(npcVisibleAtCorruption(npc({}), 0)).toBe(true);
    expect(npcVisibleAtCorruption(npc({}), 100)).toBe(true);
  });

  it('hideAboveCorruption vanishes the NPC once reached', () => {
    const villager = npc({ hideAboveCorruption: 50 });
    expect(npcVisibleAtCorruption(villager, 49)).toBe(true);
    expect(npcVisibleAtCorruption(villager, 50)).toBe(false);
  });

  it('showAboveCorruption reveals a prop only once reached', () => {
    const boards = npc({ prop: true, showAboveCorruption: 50 });
    expect(npcVisibleAtCorruption(boards, 49)).toBe(false);
    expect(npcVisibleAtCorruption(boards, 50)).toBe(true);
  });
});

describe('corruptedEnemy', () => {
  const wolf: EnemyData = {
    id: 'w', sprite: 'w', hp: 30, dmg: 10, spd: 40, xp: 10, aggro: 100, width: 10, height: 8,
    charge: { range: 130, windup: 0.5, speed: 240, duration: 0.45, cooldown: 3 },
    corrupt: { tierMin: 50, tint: '#c060c0', slam: { interval: 4, damage: 10, radius: 42 } },
  };

  it('returns the base def unchanged below the variant threshold', () => {
    const r = corruptedEnemy(wolf, 40);
    expect(r.def).toBe(wolf);
    expect(r.def.slam).toBeUndefined();
    expect(r.tint).toBeNull();
  });

  it('overlays the extra move + tint once corruption reaches tierMin', () => {
    const r = corruptedEnemy(wolf, 60);
    expect(r.def.slam).toEqual({ interval: 4, damage: 10, radius: 42 }); // new move added
    expect(r.def.charge).toEqual(wolf.charge); // base move kept
    expect(r.tint).toBe(0xc060c0);
    expect(wolf.slam).toBeUndefined(); // base def never mutated
  });

  it('leaves plain enemies (no corrupt block) untouched at any corruption', () => {
    const plain: EnemyData = { id: 'p', sprite: 'p', hp: 10, dmg: 1, spd: 1, xp: 1, aggro: 1, width: 4, height: 4 };
    const r = corruptedEnemy(plain, 100);
    expect(r.def).toBe(plain);
    expect(r.tint).toBeNull();
  });
});
