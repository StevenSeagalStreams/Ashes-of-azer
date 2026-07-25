import { z } from 'zod';

// Affix pool, Diablo-2-style tiers (m4.x itemization overhaul). An affix rolls
// one of its `tiers`: a tier is only eligible on an item whose item level (ilvl)
// is at least the tier's `ilvl`, and among eligible tiers one is chosen weighted
// by `weight` — low tiers common, high tiers rare. So magic items can luck into
// an extreme single stat and rares only occasionally roll a top tier, exactly as
// in D2. `labelTemplate`'s `{v}` is filled with the rolled value.
export const AffixTierSchema = z.object({
  ilvl: z.number().int().nonnegative(), // minimum item level for this tier to roll
  min: z.number(),
  max: z.number(),
  weight: z.number().positive(), // relative roll weight among eligible tiers
});
export type AffixTier = z.infer<typeof AffixTierSchema>;

export const AffixSchema = z.object({
  key: z.string(),
  labelTemplate: z.string(),
  flag: z.boolean().optional(), // true for boolean affixes like "poison" (value always 1)
  tiers: z.array(AffixTierSchema).min(1), // ordered low→high; at least one tier
});
export type AffixData = z.infer<typeof AffixSchema>;

export const AffixesFileSchema = z.array(AffixSchema);
export type AffixesFile = z.infer<typeof AffixesFileSchema>;
