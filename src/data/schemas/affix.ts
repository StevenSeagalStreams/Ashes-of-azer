import { z } from 'zod';

// Ported from the prototype's AFFIX_POOL. `labelTemplate` replaces the
// prototype's n:v=>string function — a literal `{v}` placeholder the item
// system (Milestone 1.5) substitutes the rolled value into.
export const AffixSchema = z.object({
  key: z.string(),
  labelTemplate: z.string(),
  min: z.number(),
  max: z.number(),
  flag: z.boolean().optional(), // true for boolean affixes like "poison" (no roll)
});
export type AffixData = z.infer<typeof AffixSchema>;

export const AffixesFileSchema = z.array(AffixSchema);
export type AffixesFile = z.infer<typeof AffixesFileSchema>;
