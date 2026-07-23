import { z } from 'zod';
import { ElementSchema } from './skill.ts';

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

// The item-modifies-skill primitive (m1.5): an equipped item can change one
// numeric property of one skill. `mod` names a skill field (split, chain,
// pierce, count, returns, radius, damageMultiplier, stunDuration, burnDps...);
// the resolver adds to (or sets) that field, creating it when the skill lacks
// it (so a mod can *grant* chaining/returning to a skill that had neither).
export const SkillModSchema = z.object({
  skill: z.string(), // target skill id
  mod: z.string(), // which field to change
  value: z.number(),
  op: z.enum(['add', 'set']).default('add'),
});
export type SkillMod = z.infer<typeof SkillModSchema>;

// A triggered effect a legendary grants (m1.5). `on` is when it fires; `effect`
// is what happens, dispatched generically so new legendaries reusing an effect
// need no code. Kept data-driven per CLAUDE.md's content rule.
export const ItemHookSchema = z.object({
  on: z.enum(['onCast', 'onHit', 'onKill']),
  effect: z.enum(['explode', 'burn', 'chill', 'heal', 'manaGain']),
  value: z.number(), // effect magnitude (damage, dps, %, mana...)
  radius: z.number().positive().optional(), // for area effects (explode)
  duration: z.number().positive().optional(), // for burn/chill
  element: ElementSchema.optional(),
});
export type ItemHook = z.infer<typeof ItemHookSchema>;

export const LegendarySchema = z.object({
  name: z.string(),
  slot: ItemSlotSchema,
  power: z.string(), // stable id; also what an equipped ItemInstance references
  text: z.string(),
  forcedAffixes: z.array(z.object({ key: z.string(), value: z.number() })),
  skillMods: z.array(SkillModSchema).default([]),
  hooks: z.array(ItemHookSchema).default([]),
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
