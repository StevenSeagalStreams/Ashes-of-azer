import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import { gearStats, rollItem, type Rng } from './loot.ts';
import type { ItemInstance } from './save/schema.ts';

const { items, affixes } = loadGameData();

// A scripted RNG: returns the queued values in order (looping), so a roll is
// fully deterministic without depending on Math.random.
const scriptRng = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('rollItem', () => {
  it('rolls a base of the forced slot with the right number of affixes', () => {
    // rarity 0.8 → 'rare' (cumulative 0.76..0.92, affixCount 2); base pick 0; then 2 affixes.
    const item = rollItem(items, affixes, scriptRng([0.8, 0, 0.1, 0.5, 0.2, 0.5]), { slot: 'Weapon' });
    expect(item.slot).toBe('Weapon');
    const rare = items.rarities.find((r) => r.id === 'rare')!;
    expect(item.affixes.length).toBe(rare.affixCount);
    expect(item.rarity).toBe('rare');
  });

  it('a white roll has no affixes', () => {
    const item = rollItem(items, affixes, scriptRng([0.0, 0]), { slot: 'Helmet' });
    expect(item.rarity).toBe('white');
    expect(item.affixes).toEqual([]);
  });

  it('rolls affix values within their declared min/max', () => {
    const item = rollItem(items, affixes, scriptRng([0.8, 0, 0.1, 0.99, 0.2, 0.99]), { slot: 'Ring' });
    for (const aff of item.affixes) {
      const def = affixes.find((a) => a.key === aff.key)!;
      expect(aff.value).toBeGreaterThanOrEqual(def.flag ? 1 : def.min);
      expect(aff.value).toBeLessThanOrEqual(def.flag ? 1 : def.max);
    }
  });

  it('never rolls the same affix twice on one item', () => {
    const item = rollItem(items, affixes, scriptRng([0.8, 0, 0.1, 0.3, 0.7, 0.7]), { slot: 'Chest' });
    const keys = item.affixes.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a legendary roll for a slot with a legendary yields it (power + forced affixes)', () => {
    // Force the highest rarity roll (~0.99 → legendary). Ring has legendaries.
    const item = rollItem(items, affixes, scriptRng([0.99, 0]), { slot: 'Ring' });
    expect(item.rarity).toBe('legendary');
    expect(item.power).toBeTruthy();
    const leg = items.legendaries.find((l) => l.power === item.power)!;
    expect(item.affixes).toEqual(leg.forcedAffixes);
  });
});

describe('gearStats', () => {
  const weapon: ItemInstance = { slot: 'Weapon', name: 'Blade', base: 7, rarity: 'rare', affixes: [{ key: 'dmg', value: 5 }, { key: 'crit', value: 10 }] };
  const chest: ItemInstance = { slot: 'Chest', name: 'Plate', base: 8, rarity: 'magic', affixes: [{ key: 'hp', value: 30 }] };

  it('weapon base is flat damage; other bases are life ×3', () => {
    const s = gearStats({ Weapon: weapon, Chest: chest });
    expect(s.flatDamage).toBe(7 + 5); // base + dmg affix
    expect(s.maxHp).toBe(8 * 3 + 30); // chest base×3 + hp affix
    expect(s.critPct).toBe(10);
  });

  it('maps each affix key to its stat and flags poison', () => {
    const ring: ItemInstance = {
      slot: 'Ring', name: 'Loop', base: 3, rarity: 'epic',
      affixes: [{ key: 'aspd', value: 12 }, { key: 'ms', value: 8 }, { key: 'lifesteal', value: 4 }, { key: 'poison', value: 1 }],
    };
    const s = gearStats({ Ring: ring });
    expect(s.aspdPct).toBe(12);
    expect(s.moveSpeedPct).toBe(8);
    expect(s.lifestealPct).toBe(4);
    expect(s.poison).toBe(true);
    expect(s.maxHp).toBe(3 * 3); // ring base counts as life
  });

  it('empty gear yields all-zero stats', () => {
    const s = gearStats({});
    expect(s.flatDamage).toBe(0);
    expect(s.maxHp).toBe(0);
    expect(s.poison).toBe(false);
  });
});
