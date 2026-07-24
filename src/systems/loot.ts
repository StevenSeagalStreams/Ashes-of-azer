// Loot roll engine + gear-stat aggregation (Milestone 1.7 — the loot loop).
// Pure and unit-tested: an RNG is injected so rolls are deterministic in tests.

import type { AffixData, AffixesFile, AffixTier, ItemSlot, ItemsFile, SetData } from '../data/schemas/index.ts';
import type { ItemInstance } from './save/schema.ts';

export type Rng = () => number; // [0, 1)

const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)] as T;
const randInt = (min: number, max: number, rng: Rng): number => min + Math.floor(rng() * (max - min + 1));

/** The default item level for rolls that don't specify one (tests, fallbacks). */
export const DEFAULT_ILVL = 1;

/**
 * Chooses one affix tier for a given item level: only tiers with `ilvl` ≤ the
 * item's level are eligible, and among those one is picked weighted by `weight`
 * (low tiers common, high tiers rare — the D2 tier curve). Returns null when the
 * affix has no tier the item level can reach yet.
 */
export function rollAffixTier(affix: AffixData, ilvl: number, rng: Rng): AffixTier | null {
  const eligible = affix.tiers.filter((t) => ilvl >= t.ilvl);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, t) => s + t.weight, 0);
  let roll = rng() * total;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll < 0) return t;
  }
  return eligible[eligible.length - 1]!;
}

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
  rarity?: string; // force a rarity id (crafting); otherwise rolled by dropChance
  luck?: number; // extra rarity rolls (corruption); the best of (1 + luck) wins
  ilvl?: number; // item level of the drop — gates which affix tiers can roll
}

/** Best-of-(1+luck) rarity roll — higher luck biases toward rarer tiers. */
function rollRarityLucky(items: ItemsFile, rng: Rng, luck: number): ItemsFile['rarities'][number] {
  let best = rollRarity(items, rng);
  const order = (r: ItemsFile['rarities'][number]): number => items.rarities.indexOf(r);
  for (let i = 0; i < luck; i++) {
    const r = rollRarity(items, rng);
    if (order(r) > order(best)) best = r;
  }
  return best;
}

const RARITY_DURABILITY_BONUS: Record<string, number> = { white: 0, magic: 10, rare: 20, epic: 30, legendary: 50, set: 50 };

/** Full durability a freshly-rolled item spawns with (sturdier when better). */
export const durabilityFor = (base: number, rarity: string): number =>
  Math.max(10, Math.round(30 + base * 4 + (RARITY_DURABILITY_BONUS[rarity] ?? 0)));

/** Repair cost in gold to restore an item to full (1g per missing point). */
export const repairCost = (item: ItemInstance): number => {
  if (item.maxDurability === undefined || item.durability === undefined) return 0;
  return Math.max(0, item.maxDurability - item.durability);
};

/** True when an item has a durability track and has worn down to broken (0). */
export const isBroken = (item: ItemInstance): boolean =>
  item.maxDurability !== undefined && item.durability !== undefined && item.maxDurability > 0 && item.durability <= 0;

/**
 * Rolls one item instance at item level `opts.ilvl`. Legendary rarity with a
 * matching legendary yields that legendary (its forced affixes + power);
 * otherwise a base of the slot plus a rarity-sized count of distinct affixes,
 * each rolled from an ilvl-gated tier (the D2 curve).
 */
export function rollItem(items: ItemsFile, affixes: AffixesFile, rng: Rng, opts: RollOpts = {}): ItemInstance {
  const eligible = slotsWithBases(items);
  const slot = opts.slot ?? pick(eligible, rng);
  const rarity = opts.rarity
    ? items.rarities.find((r) => r.id === opts.rarity) ?? rollRarity(items, rng)
    : rollRarityLucky(items, rng, opts.luck ?? 0);
  const ilvl = Math.max(1, Math.floor(opts.ilvl ?? DEFAULT_ILVL));

  if (rarity.id === 'legendary') {
    const forSlot = items.legendaries.filter((l) => l.slot === slot);
    if (forSlot.length > 0) {
      const leg = pick(forSlot, rng);
      const bases = items.bases[slot] ?? [];
      const base = bases.reduce((mx, b) => Math.max(mx, b.base), 0); // legendaries roll the best base
      const dur = durabilityFor(base, 'legendary');
      return { slot, name: leg.name, base, rarity: 'legendary', ilvl, affixes: [...leg.forcedAffixes], power: leg.power, durability: dur, maxDurability: dur };
    }
  }

  if (rarity.id === 'set') {
    // Gather every set piece for this slot (tagged with its set id), pick one.
    const forSlot = items.sets.flatMap((s) => s.pieces.filter((p) => p.slot === slot).map((p) => ({ p, setId: s.id })));
    if (forSlot.length > 0) {
      const { p, setId } = pick(forSlot, rng);
      const bases = items.bases[slot] ?? [];
      const base = bases.reduce((mx, b) => Math.max(mx, b.base), 0); // set pieces roll the best base
      const dur = durabilityFor(base, 'set');
      return { slot, name: p.name, base, rarity: 'set', ilvl, set: setId, affixes: [...p.forcedAffixes], durability: dur, maxDurability: dur };
    }
  }

  const bases = items.bases[slot] ?? [];
  const baseItem = pick(bases, rng);
  const count = randInt(rarity.affixMin, rarity.affixMax, rng);
  const rolled = rollAffixes(affixes, count, rng, ilvl);
  const dur = durabilityFor(baseItem.base, rarity.id);
  return { slot, name: baseItem.name, base: baseItem.base, rarity: rarity.id, ilvl, affixes: rolled, durability: dur, maxDurability: dur };
}

/**
 * Rolls up to `count` distinct affixes for an item of level `ilvl`. Each affix's
 * tier is chosen by `rollAffixTier` (ilvl-gated + weighted), so values follow the
 * D2 curve. An affix whose lowest tier the item can't reach is skipped, so a
 * low-ilvl item simply rolls from the shallow end of the pool.
 */
function rollAffixes(affixes: AffixesFile, count: number, rng: Rng, ilvl: number): { key: string; value: number }[] {
  const pool = [...affixes];
  const out: { key: string; value: number }[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const a = pool.splice(idx, 1)[0]!;
    const tier = rollAffixTier(a, ilvl, rng);
    if (!tier) continue; // no tier this item level can roll — skip this affix
    out.push({ key: a.key, value: a.flag ? 1 : randInt(tier.min, tier.max, rng) });
  }
  return out;
}

// ---- pricing (m2.3 vendor) ----

const RARITY_VALUE_MULT: Record<string, number> = { white: 1, magic: 2, rare: 4, epic: 8, legendary: 16, set: 14 };

/** Buy price: base value scaled by rarity, plus a little per affix. */
export const itemValue = (item: ItemInstance): number =>
  Math.max(1, Math.round((item.base + item.affixes.length * 3) * (RARITY_VALUE_MULT[item.rarity] ?? 1)));

/** Sell price: a fraction of buy value (vendors low-ball you). */
export const sellValue = (item: ItemInstance): number => Math.max(1, Math.floor(itemValue(item) * 0.4));

/** A fresh vendor stock of `count` rolled items at item level `ilvl`. */
export function rollVendorStock(items: ItemsFile, affixes: AffixesFile, rng: Rng, count = 8, ilvl = DEFAULT_ILVL): ItemInstance[] {
  return Array.from({ length: count }, () => rollItem(items, affixes, rng, { ilvl }));
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

/** Adds one affix's contribution into a GearStats accumulator. */
function applyAffix(out: GearStats, key: string, value: number): void {
  if (key === 'poison') {
    out.poison = true;
    return;
  }
  const stat = AFFIX_TO_STAT[key];
  if (stat && stat !== 'poison') (out[stat] as number) += value;
}

/**
 * Sums the stat contribution of every equipped item (base value + affixes), plus
 * any active **partial-set bonuses**: for each set, once you wear ≥ a bonus's
 * `pieces` count, that bonus's affixes are added too (cumulatively). Broken gear
 * contributes nothing and doesn't count toward a set.
 */
export function gearStats(
  gear: Partial<Record<ItemSlot, ItemInstance | null>>,
  sets: readonly SetData[] = [],
): GearStats {
  const out = emptyGearStats();
  const setCounts = new Map<string, number>();
  for (const [slot, item] of Object.entries(gear) as [ItemSlot, ItemInstance | null][]) {
    if (!item || isBroken(item)) continue; // broken gear contributes nothing until repaired
    // Base value: a Weapon's base is flat damage; other slots contribute life×3.
    if (slot === 'Weapon') out.flatDamage += item.base;
    else out.maxHp += item.base * 3;
    for (const aff of item.affixes) applyAffix(out, aff.key, aff.value);
    if (item.set) setCounts.set(item.set, (setCounts.get(item.set) ?? 0) + 1);
  }
  // Partial-set bonuses: every threshold you meet stacks.
  for (const set of sets) {
    const worn = setCounts.get(set.id) ?? 0;
    for (const bonus of set.bonuses) {
      if (worn >= bonus.pieces) for (const aff of bonus.affixes) applyAffix(out, aff.key, aff.value);
    }
  }
  return out;
}

/** The active set bonuses for the equipped gear — for tooltip/HUD display. */
export function activeSetBonuses(
  gear: Partial<Record<ItemSlot, ItemInstance | null>>,
  sets: readonly SetData[],
): { set: SetData; worn: number }[] {
  const setCounts = new Map<string, number>();
  for (const item of Object.values(gear)) {
    if (!item || isBroken(item) || !item.set) continue;
    setCounts.set(item.set, (setCounts.get(item.set) ?? 0) + 1);
  }
  return sets.filter((s) => setCounts.has(s.id)).map((s) => ({ set: s, worn: setCounts.get(s.id) ?? 0 }));
}
