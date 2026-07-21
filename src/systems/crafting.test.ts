import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import { canCraft, craftItem, pickMaterial, spendInputs } from './crafting.ts';
import type { RecipeData } from '../data/schemas/index.ts';
import type { Rng } from './loot.ts';

const { items, affixes } = loadGameData();

const scriptRng = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const recipe: RecipeData = {
  id: 'r1',
  name: 'Test Forge',
  description: '',
  inputs: [
    { material: 'scrap', count: 4 },
    { material: 'bone', count: 2 },
  ],
  gold: 40,
  result: { slot: 'Weapon', rarity: 'rare' },
};

describe('canCraft', () => {
  it('needs every input material and the gold', () => {
    expect(canCraft(recipe, { scrap: 4, bone: 2 }, 40)).toBe(true);
    expect(canCraft(recipe, { scrap: 4, bone: 2 }, 39)).toBe(false); // short on gold
    expect(canCraft(recipe, { scrap: 3, bone: 2 }, 40)).toBe(false); // short on scrap
    expect(canCraft(recipe, { scrap: 4 }, 40)).toBe(false); // missing bone entirely
  });
});

describe('spendInputs', () => {
  it('subtracts inputs without mutating the source', () => {
    const stock = { scrap: 5, bone: 3, ember: 1 };
    const after = spendInputs(recipe, stock);
    expect(after).toEqual({ scrap: 1, bone: 1, ember: 1 });
    expect(stock).toEqual({ scrap: 5, bone: 3, ember: 1 }); // untouched
  });

  it('never drops a count below zero', () => {
    expect(spendInputs(recipe, { scrap: 4, bone: 0 })).toEqual({ scrap: 0, bone: 0 });
  });
});

describe('craftItem', () => {
  it('forges an item of the recipe slot at the forced rarity, with full durability', () => {
    const item = craftItem(recipe, items, affixes, scriptRng([0.1, 0.5, 0.5, 0.5]));
    expect(item.slot).toBe('Weapon');
    expect(item.rarity).toBe('rare');
    expect(item.durability).toBeGreaterThan(0);
    expect(item.durability).toBe(item.maxDurability);
    const rare = items.rarities.find((r) => r.id === 'rare')!;
    expect(item.affixes.length).toBe(rare.affixCount);
  });
});

describe('pickMaterial', () => {
  const mats = [
    { id: 'a', name: 'A', color: '#111', weight: 1 },
    { id: 'b', name: 'B', color: '#222', weight: 3 },
  ];

  it('picks by weight and returns null for an empty table', () => {
    expect(pickMaterial(mats, () => 0.0)?.id).toBe('a'); // first slice (weight 1 of 4)
    expect(pickMaterial(mats, () => 0.5)?.id).toBe('b'); // 0.5×4=2 → into b's slice
    expect(pickMaterial([], () => 0.5)).toBeNull();
  });
});
