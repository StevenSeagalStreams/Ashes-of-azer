// The item-modifies-skill resolver (Milestone 1.5 — the heart of the design).
// Pure and unit-tested: given a skill and the mods from equipped items, it
// returns an "effective skill" with those mods folded in. The rest of the game
// (cast path, hotbar, tooltips) then reads the effective skill and needs no
// per-mod branching — an item changes how a skill *behaves*, not just its numbers.

import type { ItemSlot, LegendaryData, SkillData, SkillMod } from '../data/schemas/index.ts';
import type { ItemInstance } from './save/schema.ts';

// Fields a mod may *create* on a skill that lacks them (granting new behaviour).
// Present fields are detected by shape at runtime; these cover the absent case,
// where the field name alone can't tell us the shape.
const CREATABLE: Record<string, 'rank' | 'number' | 'bool'> = {
  split: 'number',
  chainRange: 'number',
  returns: 'bool',
  count: 'rank',
  pierce: 'rank',
  chain: 'rank',
  burnDps: 'rank',
};

interface RankScaling {
  base: number;
  perRank: number;
}

const isRank = (v: unknown): v is RankScaling =>
  typeof v === 'object' && v !== null && 'base' in v && 'perRank' in v;

function applyOne(rec: Record<string, unknown>, m: SkillMod): void {
  const cur = rec[m.mod];
  if (isRank(cur)) {
    cur.base = m.op === 'set' ? m.value : cur.base + m.value;
  } else if (typeof cur === 'number') {
    rec[m.mod] = m.op === 'set' ? m.value : cur + m.value;
  } else if (typeof cur === 'boolean') {
    rec[m.mod] = m.value > 0;
  } else if (cur === undefined) {
    const shape = CREATABLE[m.mod];
    if (!shape) return; // unknown/absent field we don't know how to create — ignore
    if (shape === 'rank') rec[m.mod] = { base: m.value, perRank: 0 };
    else if (shape === 'number') rec[m.mod] = m.value;
    else rec[m.mod] = m.value > 0;
  }
}

/** Returns `skill` with every mod that targets it applied. Never mutates input. */
export function applySkillMods(skill: SkillData, mods: readonly SkillMod[]): SkillData {
  const mine = mods.filter((m) => m.skill === skill.id);
  if (mine.length === 0) return skill;
  const clone = structuredClone(skill);
  const rec = clone as unknown as Record<string, unknown>;
  for (const m of mine) applyOne(rec, m);
  return clone;
}

/** Applies the equipped mods across a whole skill list (per-class kit). */
export const applySkillModsAll = (skills: readonly SkillData[], mods: readonly SkillMod[]): SkillData[] =>
  skills.map((s) => applySkillMods(s, mods));

/** The legendary defs for whatever is equipped, resolved via each item's `power`. */
export function equippedLegendaries(
  gear: Partial<Record<ItemSlot, ItemInstance | null>>,
  legendaries: readonly LegendaryData[],
): LegendaryData[] {
  const byPower = new Map(legendaries.map((l) => [l.power, l]));
  const out: LegendaryData[] = [];
  for (const item of Object.values(gear)) {
    if (!item?.power) continue;
    const def = byPower.get(item.power);
    if (def) out.push(def);
  }
  return out;
}

/** All skillMods contributed by the currently equipped gear. */
export const equippedSkillMods = (
  gear: Partial<Record<ItemSlot, ItemInstance | null>>,
  legendaries: readonly LegendaryData[],
): SkillMod[] => equippedLegendaries(gear, legendaries).flatMap((l) => l.skillMods);
