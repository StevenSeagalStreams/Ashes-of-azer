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

// Stat keys passives may modify; map 1:1 onto Player-derived stats.
// The first block is flat always-on stats; the second block is applied
// conditionally by engine hooks (on hit / on kill / on damage taken) —
// the value is still a plain per-rank scaling, the *condition* lives in code.
export const PassiveStatSchema = z.enum([
  'maxHpPct',
  'moveSpeedPct',
  'critPct',
  'aspdPct',
  'cdrPct',
  'damagePct',
  'lifestealPct', // heal this % of damage dealt
  'thornsPct', // reflect this % of damage taken
  'blockPct', // chance to fully block an incoming hit
  'manaOnKill', // flat mana restored per kill
  'damageVsStunnedPct', // +% damage vs stunned enemies
  'berserkDamagePct', // +% damage while below 30% life
]);
export type PassiveStat = z.infer<typeof PassiveStatSchema>;

export const SkillSchema = z.discriminatedUnion('mechanic', [
  z.object({
    mechanic: z.literal('passive'), // always-on modifiers while slotted
    id: z.string(),
    icon: z.string(),
    name: z.string(),
    unlockLevel: z.number().int().nonnegative(),
    maxRank: z.number().int().positive(),
    startingRank: z.number().int().nonnegative().default(0),
    modifiers: z.partialRecord(PassiveStatSchema, RankScaling),
  }),
  SkillCommon.extend({
    mechanic: z.literal('shockwave'), // Shield Slam, Whirlwind, Hammerfall, Earthshatter
    radius: RankScaling,
    damageMultiplier: RankScaling,
    stunDuration: RankScaling.optional(),
    bleed: z.object({ dps: RankScaling, duration: z.number().positive() }).optional(), // Ground Rend
  }),
  SkillCommon.extend({
    mechanic: z.literal('generator'), // Heroic Strike, Cleave — cheap primary that RESTORES mana
    radius: RankScaling,
    damageMultiplier: RankScaling,
    manaGain: RankScaling, // mana restored per enemy hit
  }),
  SkillCommon.extend({
    mechanic: z.literal('charge'), // dash along facing, hit + stun everything in the corridor
    distance: RankScaling,
    damageMultiplier: RankScaling,
    stunDuration: RankScaling,
  }),
  SkillCommon.extend({
    mechanic: z.literal('debuff'), // Taunt — apply a vulnerability (take +% damage)
    radius: RankScaling,
    vulnerablePct: RankScaling,
    duration: z.number().positive(),
  }),
  SkillCommon.extend({
    mechanic: z.literal('heal'), // Second Wind — heal % of max life
    healPct: RankScaling,
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
    mechanic: z.literal('buff'), // War Cry (offensive), Iron Guard (defensive)
    damageBonusPct: RankScaling,
    damageReductionPct: RankScaling.optional(), // Iron Guard
    duration: z.number().positive(),
  }),
]);
export type SkillData = z.infer<typeof SkillSchema>;

export const SkillsFileSchema = z.array(SkillSchema);
export type SkillsFile = z.infer<typeof SkillsFileSchema>;
