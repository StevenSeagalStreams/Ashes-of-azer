import { z } from 'zod';

// Ported from the prototype's ETYPES (slime/bat/skel/boss). This is the
// authoritative enemy roster — adding a new enemy type means adding an
// entry to data/enemies.json, nothing else.

// ---- Attack-pattern configs (m2.4). Named so the corruption variant (m3) can
// reuse the same shapes when it overlays an extra move at high corruption. ----

// Periodic AoE ground slam (prototype: Rotfang, every 4.5s, 22 dmg, 64px).
export const SlamSchema = z.object({
  interval: z.number().positive(),
  damage: z.number().positive(),
  radius: z.number().positive(),
});
// Charger: telegraph, then dash toward the player's locked position at `speed`
// for `duration`s; contact during the dash lands `dmg`. Then waits `cooldown`.
export const ChargeSchema = z.object({
  range: z.number().positive(),
  windup: z.number().positive(),
  speed: z.number().positive(),
  duration: z.number().positive(),
  cooldown: z.number().positive(),
});
// Ranged: fire a projectile at the player when within `range`, every `cooldown`.
export const RangedSchema = z.object({
  range: z.number().positive(),
  cooldown: z.number().positive(),
  damage: z.number().positive(),
  projectileSpeed: z.number().positive(),
});
// Exploder: rush in, and within `range` telegraph then self-destruct, dealing
// `damage` to the player inside `radius`. Dies on detonation.
export const ExplodeSchema = z.object({
  range: z.number().positive(),
  windup: z.number().positive(),
  damage: z.number().positive(),
  radius: z.number().positive(),
});
// Summoner: every `interval`s, call up `count` minions (enemy id `minion`),
// never exceeding `max` of its own living summons.
export const SummonSchema = z.object({
  minion: z.string(),
  count: z.number().int().positive(),
  interval: z.number().positive(),
  max: z.number().int().positive(),
});

// Corruption variant (m3): at/above corruption `tierMin`, this enemy spawns
// "corrupted" — tinted `tint`, with the given pattern fields overlaid onto its
// base (recolor + one new move). Any pattern here overrides/adds to the base.
export const CorruptVariantSchema = z.object({
  tierMin: z.number().int().nonnegative(), // corruption threshold (e.g. 50 = Corrupt)
  tint: z.string(), // hex sprite tint
  slam: SlamSchema.optional(),
  charge: ChargeSchema.optional(),
  ranged: RangedSchema.optional(),
  explode: ExplodeSchema.optional(),
  summon: SummonSchema.optional(),
});
export type CorruptVariant = z.infer<typeof CorruptVariantSchema>;

export const EnemySchema = z.object({
  id: z.string(),
  sprite: z.string(),
  hp: z.number().positive(),
  dmg: z.number().nonnegative(),
  spd: z.number().nonnegative(),
  xp: z.number().nonnegative(),
  aggro: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  boss: z.boolean().optional(),
  name: z.string().optional(), // display name shown over boss health bars
  // Relic fragment (m2.4): a one-time collectible this enemy grants on death,
  // recorded in the save. `relicName` is what the pickup toast reads.
  relic: z.string().optional(),
  relicName: z.string().optional(),
  slam: SlamSchema.optional(),
  // A kiter keeps this many px between itself and the player (backs away when
  // closer, holds at range). Pairs naturally with `ranged`.
  keepDistance: z.number().positive().optional(),
  charge: ChargeSchema.optional(),
  ranged: RangedSchema.optional(),
  explode: ExplodeSchema.optional(),
  summon: SummonSchema.optional(),
  corrupt: CorruptVariantSchema.optional(), // corrupted spawn variant (m3)
});
export type EnemyData = z.infer<typeof EnemySchema>;

export const EnemiesFileSchema = z.array(EnemySchema);
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
