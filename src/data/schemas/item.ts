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
  dropChance: z.number().min(0).max(1), // relative drop weight (not an absolute probability)
  // D2-style variable affix count: an item rolls a random count in [affixMin, affixMax]
  // — magic gets 1–2, a rare 3–5, etc. Legendaries ignore this (fixed forced affixes).
  affixMin: z.number().int().nonnegative(),
  affixMax: z.number().int().nonnegative(),
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

// Set items (m4.x, D2 itemization): a named set of pieces, each with its own
// fixed signature affixes, that grant escalating **partial-set bonuses** as you
// wear more of them — the D2 hook where collecting the set is the reward.
export const SetPieceSchema = z.object({
  name: z.string(),
  slot: ItemSlotSchema,
  forcedAffixes: z.array(z.object({ key: z.string(), value: z.number() })),
});
export type SetPiece = z.infer<typeof SetPieceSchema>;

export const SetBonusSchema = z.object({
  pieces: z.number().int().min(2), // active once this many set pieces are equipped
  affixes: z.array(z.object({ key: z.string(), value: z.number() })),
});
export type SetBonus = z.infer<typeof SetBonusSchema>;

export const SetSchema = z.object({
  id: z.string(), // stable set id (an equipped set-piece ItemInstance references it)
  name: z.string(),
  pieces: z.array(SetPieceSchema).min(2),
  bonuses: z.array(SetBonusSchema).default([]), // cumulative thresholds (e.g. 2-pc, 3-pc)
});
export type SetData = z.infer<typeof SetSchema>;

// Runes (m4.x, D2 itemization): rare drops you socket into white bases. Each
// rune grants a modest affix on its own; ordered combinations spell runewords
// (a later box). `weight` biases the drop table — low runes common, high rare.
export const RuneSchema = z.object({
  id: z.string(),
  name: z.string(),
  letter: z.string(), // 1–3 char glyph shown in a filled socket
  weight: z.number().positive(), // drop weight (higher = more common)
  affixes: z.array(z.object({ key: z.string(), value: z.number() })), // granted while socketed
});
export type RuneData = z.infer<typeof RuneSchema>;

// Which slots can carry sockets (D2: weapons + body armor + helms). Rings/boots
// never socket, so white bases there stay plain.
export const SOCKETABLE_SLOTS: ItemSlot[] = ['Weapon', 'Helmet', 'Chest'];

// Runewords (m4.x, D2 itemization): an exact ordered sequence of runes socketed
// into a matching base "spells" a runeword, granting fixed powers that override
// the runes' individual affixes — the D2 chase. The base must be one of `slots`,
// have exactly `runes.length` sockets, and all filled in this order.
export const RunewordSchema = z.object({
  id: z.string(),
  name: z.string(),
  runes: z.array(z.string()).min(2), // ordered rune ids
  slots: z.array(ItemSlotSchema).min(1), // which base slots this runeword can form in
  affixes: z.array(z.object({ key: z.string(), value: z.number() })),
});
export type RunewordData = z.infer<typeof RunewordSchema>;

export const ItemsFileSchema = z.object({
  slots: z.array(ItemSlotSchema),
  // Not every slot needs bases yet (future slots from Milestone 4.x can be
  // added to `slots` before any base items exist for them).
  bases: z.partialRecord(ItemSlotSchema, z.array(ItemBaseSchema)),
  rarities: z.array(RarityTierSchema),
  legendaries: z.array(LegendarySchema),
  sets: z.array(SetSchema).default([]),
  runes: z.array(RuneSchema).default([]),
  runewords: z.array(RunewordSchema).default([]),
});
export type ItemsFile = z.infer<typeof ItemsFileSchema>;
