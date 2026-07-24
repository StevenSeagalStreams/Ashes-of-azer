import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import {
  BOSS_DROP_CHANCES,
  NORMAL_DROP_CHANCES,
  effectiveMagicFind,
  gearStats,
  isBroken,
  itemValue,
  repairCost,
  rollAffixTier,
  rollDropRarity,
  rollItem,
  sellValue,
  type Rng,
} from './loot.ts';
import type { ItemInstance } from './save/schema.ts';

const { items, affixes } = loadGameData();

// A scripted RNG: returns the queued values in order (looping), so a roll is
// fully deterministic without depending on Math.random.
const scriptRng = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

// A seeded PRNG for statistical assertions (many rolls) without Math.random.
const seeded = (seed: number): Rng => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rarityById = (id: string) => items.rarities.find((r) => r.id === id)!;

describe('rollItem', () => {
  it('rolls a base of the forced slot with a rarity-appropriate affix count', () => {
    const rng = seeded(1);
    const rare = rarityById('rare');
    for (let i = 0; i < 200; i++) {
      const item = rollItem(items, affixes, rng, { slot: 'Weapon', rarity: 'rare', ilvl: 50 });
      expect(item.slot).toBe('Weapon');
      expect(item.rarity).toBe('rare');
      // At a high ilvl every affix has an eligible tier, so the count lands in range.
      expect(item.affixes.length).toBeGreaterThanOrEqual(rare.affixMin);
      expect(item.affixes.length).toBeLessThanOrEqual(rare.affixMax);
      expect(item.ilvl).toBe(50);
    }
  });

  it('a white roll has no affixes', () => {
    const item = rollItem(items, affixes, scriptRng([0.0, 0]), { slot: 'Helmet' });
    expect(item.rarity).toBe('white');
    expect(item.affixes).toEqual([]);
  });

  it('rolls affix values within some eligible tier of the affix', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const item = rollItem(items, affixes, rng, { slot: 'Ring', rarity: 'rare', ilvl: 50 });
      for (const aff of item.affixes) {
        const def = affixes.find((a) => a.key === aff.key)!;
        if (def.flag) { expect(aff.value).toBe(1); continue; }
        const lo = Math.min(...def.tiers.map((t) => t.min));
        const hi = Math.max(...def.tiers.map((t) => t.max));
        expect(aff.value).toBeGreaterThanOrEqual(lo);
        expect(aff.value).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('never rolls the same affix twice on one item', () => {
    const rng = seeded(3);
    for (let i = 0; i < 100; i++) {
      const item = rollItem(items, affixes, rng, { slot: 'Chest', rarity: 'rare', ilvl: 50 });
      const keys = item.affixes.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('luck (corruption) takes the best of extra rarity rolls', () => {
    // luck 1 → best of two rarity rolls: a white (0.0) and a rare (0.95) → rare.
    const item = rollItem(items, affixes, scriptRng([0.0, 0.95, 0, 0.1, 0.5, 0.2, 0.5]), { slot: 'Helmet', luck: 1, ilvl: 30 });
    expect(['rare', 'unique', 'set']).toContain(item.rarity);
    expect(item.rarity).not.toBe('white');
  });

  it('honours a forced rarity (crafting) regardless of the rarity roll value', () => {
    const item = rollItem(items, affixes, scriptRng([0.0, 0, 0.9, 0.1, 0.5, 0.2, 0.5]), { slot: 'Weapon', rarity: 'rare', ilvl: 40 });
    expect(item.rarity).toBe('rare');
    expect(item.affixes.length).toBeGreaterThanOrEqual(rarityById('rare').affixMin);
  });

  it('a unique roll for a slot with a unique yields it (power + forced affixes)', () => {
    const item = rollItem(items, affixes, scriptRng([0, 0]), { slot: 'Ring', rarity: 'unique', ilvl: 40 });
    expect(item.rarity).toBe('unique');
    expect(item.power).toBeTruthy();
    const leg = items.legendaries.find((l) => l.power === item.power)!;
    expect(item.affixes).toEqual(leg.forcedAffixes);
  });

  it('a set roll yields a set piece tagged with its set id + fixed affixes', () => {
    const helmetPieces = items.sets.flatMap((s) => s.pieces.filter((p) => p.slot === 'Helmet').map((p) => ({ p, setId: s.id })));
    expect(helmetPieces.length).toBeGreaterThan(0); // there is a Helmet set piece to roll
    const item = rollItem(items, affixes, scriptRng([0, 0]), { slot: 'Helmet', rarity: 'set', ilvl: 40 });
    expect(item.rarity).toBe('set');
    expect(item.set).toBeTruthy();
    const set = items.sets.find((s) => s.id === item.set)!;
    const piece = set.pieces.find((p) => p.name === item.name)!;
    expect(item.affixes).toEqual(piece.forcedAffixes);
  });
});

describe('item levels + affix tiers (D2 itemization)', () => {
  it('gates high tiers behind item level — a low-ilvl item never rolls a top tier', () => {
    const dmg = affixes.find((a) => a.key === 'dmg')!;
    const topTier = dmg.tiers.reduce((mx, t) => (t.ilvl > mx.ilvl ? t : mx));
    const rng = seeded(11);
    let sawTopBand = false;
    for (let i = 0; i < 500; i++) {
      // ilvl 1: only tiers with ilvl ≤ 1 are eligible, so a top-band value is impossible.
      const tier = rollAffixTier(dmg, 1, rng);
      expect(tier!.ilvl).toBeLessThanOrEqual(1);
      if (tier!.max >= topTier.min) sawTopBand = true;
    }
    expect(sawTopBand).toBe(false);
  });

  it('lets a high-ilvl item reach the extreme top tier (rarely)', () => {
    const dmg = affixes.find((a) => a.key === 'dmg')!;
    const top = dmg.tiers.reduce((mx, t) => (t.ilvl > mx.ilvl ? t : mx));
    const rng = seeded(5);
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const tier = rollAffixTier(dmg, 99, rng);
      if (tier === top) hits++;
    }
    // Reachable but rare (top weight is a small fraction of the total).
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(4000 * 0.1);
  });

  it('returns null when no tier is reachable at the item level', () => {
    const poison = affixes.find((a) => a.key === 'poison')!; // lowest tier ilvl is 12
    expect(rollAffixTier(poison, 1, seeded(1))).toBeNull();
    expect(rollAffixTier(poison, 12, seeded(1))).not.toBeNull();
  });

  it('drops skew sparse & common: white/magic dominate, uniques are very rare', () => {
    const rng = seeded(99);
    const counts: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const item = rollItem(items, affixes, rng, { ilvl: 40 });
      counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
    }
    const frac = (id: string) => (counts[id] ?? 0) / N;
    // Normal + magic are the overwhelming majority (D2: most drops are chaff).
    expect(frac('white') + frac('magic')).toBeGreaterThan(0.8);
    expect(frac('white')).toBeGreaterThan(frac('magic'));
    expect(frac('magic')).toBeGreaterThan(frac('rare'));
    expect(frac('rare')).toBeGreaterThan(frac('unique'));
    // A unique is a monumental ~1% of drops (before drop-frequency sparsity).
    expect(frac('unique')).toBeLessThan(0.03);
    expect(frac('unique')).toBeGreaterThan(0); // still possible
  });
});

describe('D2 drop cascade', () => {
  it('Magic Find has diminishing returns and never trivialises uniques', () => {
    expect(effectiveMagicFind(0, 'unique')).toBe(0);
    // Monotonic increasing but sub-linear, and always below the MF value itself.
    const a = effectiveMagicFind(100, 'unique');
    const b = effectiveMagicFind(300, 'unique');
    expect(b).toBeGreaterThan(a);
    expect(a).toBeLessThan(100);
    // Rarer tiers scale slower than commoner ones at the same MF.
    expect(effectiveMagicFind(200, 'unique')).toBeLessThan(effectiveMagicFind(200, 'rare'));
  });

  it('cascades unique → set → rare → magic → white', () => {
    // Each rng value is compared in turn; a tiny value passes the first check.
    expect(rollDropRarity(scriptRng([0.0]), NORMAL_DROP_CHANCES)).toBe('unique');
    expect(rollDropRarity(scriptRng([1, 0.0]), NORMAL_DROP_CHANCES)).toBe('set');
    expect(rollDropRarity(scriptRng([1, 1, 0.0]), NORMAL_DROP_CHANCES)).toBe('rare');
    expect(rollDropRarity(scriptRng([1, 1, 1, 0.0]), NORMAL_DROP_CHANCES)).toBe('magic');
    expect(rollDropRarity(scriptRng([1, 1, 1, 1]), NORMAL_DROP_CHANCES)).toBe('white');
  });

  it('a boss table never falls through to white (floorMagic)', () => {
    expect(rollDropRarity(scriptRng([1, 1, 1, 1]), BOSS_DROP_CHANCES)).toBe('magic');
  });

  it('normal drops are overwhelmingly white/magic; set+unique are a rounding error', () => {
    const rng = seeded(42);
    const counts: Record<string, number> = {};
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const r = rollDropRarity(rng, NORMAL_DROP_CHANCES);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const frac = (id: string) => (counts[id] ?? 0) / N;
    expect(frac('white')).toBeGreaterThan(0.6);
    expect(frac('white') + frac('magic')).toBeGreaterThan(0.9);
    expect(frac('rare')).toBeLessThan(0.06);
    expect(frac('unique') + frac('set')).toBeLessThan(0.02); // monumental
    expect(frac('unique')).toBeGreaterThan(0); // but still possible
  });

  it('Magic Find raises the unique rate (with diminishing returns)', () => {
    const rate = (mf: number) => {
      const rng = seeded(7 + mf);
      let u = 0;
      const N = 40000;
      for (let i = 0; i < N; i++) if (rollDropRarity(rng, NORMAL_DROP_CHANCES, mf) === 'unique') u++;
      return u / N;
    };
    const base = rate(0);
    const high = rate(240);
    expect(high).toBeGreaterThan(base); // MF helps
    expect(high).toBeLessThan(base * 4); // but diminishing — not runaway
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
      slot: 'Ring', name: 'Loop', base: 3, rarity: 'rare',
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

describe('set bonuses', () => {
  const set = items.sets[0]!; // Mirekeeper's Vigil (Helmet/Chest/Boots)
  const pieceFor = (slot: 'Helmet' | 'Chest' | 'Boots'): ItemInstance => {
    const p = set.pieces.find((x) => x.slot === slot)!;
    return { slot, name: p.name, base: 4, rarity: 'set', set: set.id, affixes: [...p.forcedAffixes] };
  };
  const bonusAt = (n: number) => set.bonuses.find((b) => b.pieces === n);

  it('a lone set piece grants only its own affixes, no set bonus', () => {
    const two = bonusAt(2);
    const critFromBonus = two?.affixes.find((a) => a.key === 'crit')?.value ?? 0;
    const s = gearStats({ Helmet: pieceFor('Helmet') }, items.sets);
    expect(s.critPct).toBe(0); // the 2-pc crit bonus is not active with one piece
    expect(critFromBonus).toBeGreaterThan(0); // sanity: the 2-pc bonus does grant crit
  });

  it('wearing the threshold count activates the partial-set bonus (cumulatively)', () => {
    const gear = { Helmet: pieceFor('Helmet'), Chest: pieceFor('Chest'), Boots: pieceFor('Boots') };
    const full = gearStats(gear, items.sets);
    // Every declared bonus threshold (2-pc, 3-pc) is met at 3 pieces, so all apply.
    let expectedCrit = 0;
    let expectedLifesteal = 0;
    for (const b of set.bonuses) {
      expectedCrit += b.affixes.find((a) => a.key === 'crit')?.value ?? 0;
      expectedLifesteal += b.affixes.find((a) => a.key === 'lifesteal')?.value ?? 0;
    }
    // Set bonuses stack on top of the pieces' own affixes; check the bonus-only stats.
    expect(full.critPct).toBe(expectedCrit);
    expect(full.lifestealPct).toBe(expectedLifesteal);
  });

  it('ignores set bonuses when the sets table is not supplied', () => {
    const gear = { Helmet: pieceFor('Helmet'), Chest: pieceFor('Chest') };
    const s = gearStats(gear); // no sets arg
    expect(s.critPct).toBe(0);
  });
});

describe('socketed rune stats', () => {
  it('adds each socketed rune’s affixes on top of the item’s own', () => {
    const el = items.runes.find((r) => r.id === 'rune_el')!; // +dmg
    const tir = items.runes.find((r) => r.id === 'rune_tir')!; // +mana on kill
    const weapon: ItemInstance = {
      slot: 'Weapon', name: 'Socketed Blade', base: 7, rarity: 'white', affixes: [],
      sockets: 2, socketed: ['rune_el', 'rune_tir'],
    };
    const s = gearStats({ Weapon: weapon }, [], items.runes);
    const elDmg = el.affixes.find((a) => a.key === 'dmg')?.value ?? 0;
    const tirMana = tir.affixes.find((a) => a.key === 'manakill')?.value ?? 0;
    expect(s.flatDamage).toBe(7 + elDmg); // weapon base + El's damage
    expect(s.manaOnKill).toBe(tirMana); // Tir's mana-on-kill
  });

  it('an empty socket contributes nothing, and runes need the runes table', () => {
    const weapon: ItemInstance = { slot: 'Weapon', name: 'Open Blade', base: 7, rarity: 'white', affixes: [], sockets: 2, socketed: [] };
    expect(gearStats({ Weapon: weapon }, [], items.runes).flatDamage).toBe(7);
    // Without the runes table, socketed ids can't resolve, so grant nothing extra.
    const filled: ItemInstance = { ...weapon, socketed: ['rune_el'] };
    expect(gearStats({ Weapon: filled }).flatDamage).toBe(7);
  });
});

describe('pricing', () => {
  const white: ItemInstance = { slot: 'Ring', name: 'Copper', base: 5, rarity: 'white', affixes: [] };
  const unique: ItemInstance = { slot: 'Ring', name: 'Frostheart', base: 5, rarity: 'unique', affixes: [{ key: 'frost', value: 30 }] };

  it('scales value by rarity and affix count', () => {
    expect(itemValue(white)).toBe(5); // base 5 × ×1, no affixes
    expect(itemValue(unique)).toBe((5 + 3) * 16); // (base + 1 affix×3) × ×16
    expect(itemValue(unique)).toBeGreaterThan(itemValue(white));
  });

  it('sell value is a fraction of buy value and at least 1', () => {
    expect(sellValue(unique)).toBe(Math.floor(itemValue(unique) * 0.4));
    expect(sellValue(white)).toBeGreaterThanOrEqual(1);
  });
});

describe('durability', () => {
  it('rolled items carry full durability', () => {
    const item = rollItem(items, affixes, scriptRng([0.0, 0]), { slot: 'Weapon' });
    expect(item.maxDurability).toBeGreaterThan(0);
    expect(item.durability).toBe(item.maxDurability);
    expect(isBroken(item)).toBe(false);
  });

  it('a worn item is broken at 0 durability and contributes no stats', () => {
    const worn: ItemInstance = { slot: 'Weapon', name: 'Nub', base: 7, rarity: 'white', affixes: [{ key: 'dmg', value: 5 }], durability: 0, maxDurability: 40 };
    expect(isBroken(worn)).toBe(true);
    expect(gearStats({ Weapon: worn }).flatDamage).toBe(0); // broken → nothing
  });

  it('an item with durability left still works', () => {
    const ok: ItemInstance = { slot: 'Weapon', name: 'Blade', base: 7, rarity: 'white', affixes: [{ key: 'dmg', value: 5 }], durability: 5, maxDurability: 40 };
    expect(isBroken(ok)).toBe(false);
    expect(gearStats({ Weapon: ok }).flatDamage).toBe(7 + 5);
  });

  it('repair cost is the missing durability (0 for pristine or undurable items)', () => {
    expect(repairCost({ slot: 'Ring', name: 'x', base: 3, rarity: 'white', affixes: [], durability: 12, maxDurability: 40 })).toBe(28);
    expect(repairCost({ slot: 'Ring', name: 'x', base: 3, rarity: 'white', affixes: [], durability: 40, maxDurability: 40 })).toBe(0);
    expect(repairCost({ slot: 'Ring', name: 'old', base: 3, rarity: 'white', affixes: [] })).toBe(0);
  });
});
