import { z } from 'zod';

// Ported from the prototype's SKILLS array. The prototype encodes each
// skill's per-rank scaling as a JS function (desc/use); this schema captures
// the same math as data (base + perRank coefficients) so the skill engine
// built in Milestone 1.1/1.2 can read it without touching this file again.
// `mechanic` discriminates the handful of skill shapes the prototype uses.

const RankScaling = z.object({ base: z.number(), perRank: z.number() });

const SkillCommon = z.object({
  id: z.string(),
  key: z.string(), // hotbar key, e.g. "1"
  icon: z.string(), // prototype used an emoji; kept as a display hint
  name: z.string(),
  unlockLevel: z.number().int().nonnegative(),
  maxRank: z.number().int().positive(),
  startingRank: z.number().int().nonnegative().default(0), // ranks known at character creation
  cooldown: z.number().positive(),
  manaCost: z.number().nonnegative(),
  fxColor: z.string().optional(), // AoE ring tint; omit for skills with other fx
});

export const SkillSchema = z.discriminatedUnion('mechanic', [
  SkillCommon.extend({
    mechanic: z.literal('shockwave'), // Shield Slam, Whirlwind
    radius: RankScaling,
    damageMultiplier: RankScaling,
    stunDuration: RankScaling.optional(),
  }),
  SkillCommon.extend({
    mechanic: z.literal('leap'), // Leap
    distance: RankScaling,
    damageMultiplier: RankScaling,
    landingRadius: z.number().positive(),
    stunDuration: z.number().nonnegative(),
  }),
  SkillCommon.extend({
    mechanic: z.literal('execute'), // Execute
    range: z.number().positive(),
    damageMultiplierLow: RankScaling,
    damageMultiplierHigh: z.number(),
    lifeThresholdPct: RankScaling,
  }),
  SkillCommon.extend({
    mechanic: z.literal('buff'), // War Cry
    damageBonusPct: RankScaling,
    duration: z.number().positive(),
  }),
]);
export type SkillData = z.infer<typeof SkillSchema>;

export const SkillsFileSchema = z.array(SkillSchema);
export type SkillsFile = z.infer<typeof SkillsFileSchema>;
