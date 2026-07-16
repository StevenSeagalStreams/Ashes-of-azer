import { z } from 'zod';

// Ported from the prototype's SLOTS, BASES, RARITY and LEGENDARIES.
export const ItemSlotSchema = z.enum(['Weapon', 'Helmet', 'Chest', 'Boots', 'Ring']);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

export const ItemBaseSchema = z.object({
  name: z.string(),
  base: z.number().nonnegative(), // dmg for Weapon, life*3 contribution otherwise
});
export type ItemBase = z.infer<typeof ItemBaseSchema>;

export const RarityTierSchema = z.object({
  id: z.string(), // white/magic/rare/epic/legendary
  dropChance: z.number().min(0).max(1),
  affixCount: z.number().int().nonnegative(),
});
export type RarityTier = z.infer<typeof RarityTierSchema>;

export const LegendarySchema = z.object({
  name: z.string(),
  slot: ItemSlotSchema,
  power: z.string(), // key the item-modifies-skill hook system (m1.5) dispatches on
  text: z.string(),
  forcedAffixes: z.array(z.object({ key: z.string(), value: z.number() })),
});
export type LegendaryData = z.infer<typeof LegendarySchema>;

export const ItemsFileSchema = z.object({
  slots: z.array(ItemSlotSchema),
  // Not every slot needs bases yet (future slots from Milestone 4.x can be
  // added to `slots` before any base items exist for them).
  bases: z.partialRecord(ItemSlotSchema, z.array(ItemBaseSchema)),
  rarities: z.array(RarityTierSchema),
  legendaries: z.array(LegendarySchema),
});
export type ItemsFile = z.infer<typeof ItemsFileSchema>;
