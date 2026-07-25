import { z } from 'zod';
import { ItemSlotSchema } from './item.ts';

// Crafting content (Milestone 2.3 — the Blacksmith's crafting half). Materials
// drop from enemies (weighted by `weight`); a recipe consumes materials + gold
// and forges an item of a given slot/rarity. Fully data-driven: a content
// author adds a material or a recipe purely in data/recipes.json.
export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(), // hex, for the ground drop + UI swatch
  weight: z.number().positive(), // relative drop weight among all materials
});
export type MaterialDef = z.infer<typeof MaterialSchema>;

export const RecipeInputSchema = z.object({
  material: z.string(), // material id
  count: z.number().int().positive(),
});
export type RecipeInput = z.infer<typeof RecipeInputSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  inputs: z.array(RecipeInputSchema),
  gold: z.number().int().nonnegative().default(0),
  // What the recipe forges: an item of this slot rolled at this rarity.
  result: z.object({ slot: ItemSlotSchema, rarity: z.string() }),
});
export type RecipeData = z.infer<typeof RecipeSchema>;

export const RecipesFileSchema = z.object({
  materials: z.array(MaterialSchema),
  recipes: z.array(RecipeSchema),
});
export type RecipesFile = z.infer<typeof RecipesFileSchema>;
