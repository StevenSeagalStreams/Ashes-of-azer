// Loot roll engine + gear-stat aggregation (Milestone 1.7 — the loot loop).
// Pure and unit-tested: an RNG is injected so rolls are deterministic in tests.

import type { AffixesFile, ItemSlot, ItemsFile } from '../data/schemas/index.ts';
import type { ItemInstance } from './save/schema.ts';

export type Rng = () => number; // [0, 1)

const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)] as T;
const randInt = (min: number, max: number, rng: Rng): number => min + Math.floor(rng() * (max - min + 1));

/** Weighted rarity pick by dropChance (falls back to the last tier). */
function rollRarity(items: ItemsFile, rng: Rng): ItemsFile['rarities'][number] {
  const total = items.rarities.reduce((s, r) => s + r.dropChance, 0);
  let roll = rng() * total;
  for (const r of items.rarities) {
    roll -= r.dropChance;
    if (roll < 0) return r;
  }
  return items.rarities[items.rarities.length - 1]!;
}

/** Slots that actually have base items to roll. */
const slotsWithBases = (items: ItemsFile): ItemSlot[] =>
  items.slots.filter((s) => (items.bases[s]?.length ?? 0) > 0);

export interface RollOpts {
  slot?: ItemSlot; // force a slot; otherwise a random slot that has bases
}

/**
 * Rolls one item instance. Legendary rarity with a matching legendary yields
 * that legendary (its forced affixes + power); otherwise a base of the slot
 * plus `affixCount` distinct rolled affixes.
 */
export function rollItem(items: ItemsFile, affixes: AffixesFile, rng: Rng, opts: RollOpts = {}): ItemInstance {
  const eligible = slotsWithBases(items);
  const slot = opts.slot ?? pick(eligible, rng);
  const rarity = rollRarity(items, rng);

  if (rarity.id === 'legendary') {
    const forSlot = items.legendaries.filter((l) => l.slot === slot);
    if (forSlot.length > 0) {
      const leg = pick(forSlot, rng);
      const bases = items.bases[slot] ?? [];
      const base = bases.reduce((mx, b) => Math.max(mx, b.base), 0); // legendaries roll the best base
      return { slot, name: leg.name, base, rarity: 'legendary', affixes: [...leg.forcedAffixes], power: leg.power };
    }
  }

  const bases = items.bases[slot] ?? [];
  const baseItem = pick(bases, rng);
  const rolled = rollAffixes(affixes, rarity.affixCount, rng);
  return { slot, name: baseItem.name, base: baseItem.base, rarity: rarity.id, affixes: rolled };
}

/** Rolls `count` distinct affixes (flag affixes are value 1, others min..max). */
function rollAffixes(affixes: AffixesFile, count: number, rng: Rng): { key: string; value: number }[] {
  const pool = [...affixes];
  const out: { key: string; value: number }[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const a = pool.splice(idx, 1)[0]!;
    out.push({ key: a.key, value: a.flag ? 1 : randInt(a.min, a.max, rng) });
  }
  return out;
}

// ---- pricing (m2.3 vendor) ----

const RARITY_VALUE_MULT: Record<string, number> = { white: 1, magic: 2, rare: 4, epic: 8, legendary: 16 };

/** Buy price: base value scaled by rarity, plus a little per affix. */
export const itemValue = (item: ItemInstance): number =>
  Math.max(1, Math.round((item.base + item.affixes.length * 3) * (RARITY_VALUE_MULT[item.rarity] ?? 1)));

/** Sell price: a fraction of buy value (vendors low-ball you). */
export const sellValue = (item: ItemInstance): number => Math.max(1, Math.floor(itemValue(item) * 0.4));

/** A fresh vendor stock of `count` rolled items for a character level. */
export function rollVendorStock(items: ItemsFile, affixes: AffixesFile, rng: Rng, count = 8): ItemInstance[] {
  return Array.from({ length: count }, () => rollItem(items, affixes, rng));
}

// ---- gear → stats ----

export interface GearStats {
  flatDamage: number; // weapon base + 'dmg' affixes
  maxHp: number; // non-weapon base ×3 + 'hp' affixes
  critPct: number;
  aspdPct: number;
  moveSpeedPct: number;
  cdrPct: number;
  lifestealPct: number;
  manaOnKill: number;
  visionBonus: number;
  frostPct: number; // elemental flavour (chill on hit — wired later); tracked now
  poison: boolean;
}

const AFFIX_TO_STAT: Record<string, keyof GearStats> = {
  dmg: 'flatDamage',
  hp: 'maxHp',
  crit: 'critPct',
  aspd: 'aspdPct',
  ms: 'moveSpeedPct',
  cdr: 'cdrPct',
  lifesteal: 'lifestealPct',
  manakill: 'manaOnKill',
  vision: 'visionBonus',
  frost: 'frostPct',
};

const emptyGearStats = (): GearStats => ({
  flatDamage: 0,
  maxHp: 0,
  critPct: 0,
  aspdPct: 0,
  moveSpeedPct: 0,
  cdrPct: 0,
  lifestealPct: 0,
  manaOnKill: 0,
  visionBonus: 0,
  frostPct: 0,
  poison: false,
});

/** Sums the stat contribution of every equipped item (base value + affixes). */
export function gearStats(gear: Partial<Record<ItemSlot, ItemInstance | null>>): GearStats {
  const out = emptyGearStats();
  for (const [slot, item] of Object.entries(gear) as [ItemSlot, ItemInstance | null][]) {
    if (!item) continue;
    // Base value: a Weapon's base is flat damage; other slots contribute life×3.
    if (slot === 'Weapon') out.flatDamage += item.base;
    else out.maxHp += item.base * 3;
    for (const aff of item.affixes) {
      if (aff.key === 'poison') out.poison = true;
      const stat = AFFIX_TO_STAT[aff.key];
      if (stat && stat !== 'poison') (out[stat] as number) += aff.value;
    }
  }
  return out;
}
