// Crafting logic (Milestone 2.3 — the Blacksmith's crafting half). Pure and
// unit-tested: given the player's material stock + gold, decide whether a
// recipe can be crafted, spend its inputs, and forge the result item. The
// actual item roll delegates to loot.ts (forced slot + rarity) so a crafted
// item is a normal rolled instance with full durability.

import type { AffixesFile, ItemsFile, MaterialDef, RecipeData } from '../data/schemas/index.ts';
import type { ItemInstance } from './save/schema.ts';
import { rollItem, type Rng } from './loot.ts';

/** Player material stock: material id → quantity held. */
export type MaterialCounts = Record<string, number>;

/** True when the player has every input material (and enough gold). */
export const canCraft = (recipe: RecipeData, materials: MaterialCounts, gold: number): boolean =>
  gold >= recipe.gold && recipe.inputs.every((i) => (materials[i.material] ?? 0) >= i.count);

/** Returns a new stock with the recipe's inputs subtracted (never mutates). */
export const spendInputs = (recipe: RecipeData, materials: MaterialCounts): MaterialCounts => {
  const out: MaterialCounts = { ...materials };
  for (const i of recipe.inputs) out[i.material] = Math.max(0, (out[i.material] ?? 0) - i.count);
  return out;
};

/** Forges the recipe's result as a normal rolled item (forced slot + rarity). */
export const craftItem = (recipe: RecipeData, items: ItemsFile, affixes: AffixesFile, rng: Rng): ItemInstance =>
  rollItem(items, affixes, rng, { slot: recipe.result.slot, rarity: recipe.result.rarity });

/** Weighted pick of one material to drop (null if the table is empty). */
export const pickMaterial = (materials: readonly MaterialDef[], rng: Rng): MaterialDef | null => {
  if (materials.length === 0) return null;
  const total = materials.reduce((s, m) => s + m.weight, 0);
  let roll = rng() * total;
  for (const m of materials) {
    roll -= m.weight;
    if (roll < 0) return m;
  }
  return materials[materials.length - 1]!;
};
