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
// Poison touch (m4, Haunted Marsh): a landed contact/slam hit also inflicts a
// poison DoT on the player — `dps` damage per second for `duration` seconds.
export const PoisonAttackSchema = z.object({
  dps: z.number().positive(),
  duration: z.number().positive(),
});

// Zone-denial ground hazard (m4.x, world bosses): every `interval`s the boss
// seeds `count` lingering pools around the player — each telegraphed for
// `telegraph`s, then active for `duration`s, dealing `damage` per 0.5s tick to
// anyone inside `radius`. `spread` is how far extra pools scatter from the first.
// Forces the player to keep moving; DPS alone won't clear it.
export const HazardSchema = z.object({
  interval: z.number().positive(),
  telegraph: z.number().positive(),
  damage: z.number().positive(),
  radius: z.number().positive(),
  duration: z.number().positive(),
  count: z.number().int().positive().optional(),
  spread: z.number().nonnegative().optional(),
});

// Pack-leader aura (m4, Desert Empire): an enemy with an `aura` is a pack-leader
// whose presence buffs nearby allied enemies within `radius` — multiplying their
// damage and/or speed. Kill the leader and the buff vanishes. Data-driven; the
// scene samples active leaders each frame and applies the result to packmates.
export const AuraSchema = z.object({
  radius: z.number().positive(),
  dmgMult: z.number().positive().optional(),
  spdMult: z.number().positive().optional(),
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
  poison: PoisonAttackSchema.optional(),
});
export type CorruptVariant = z.infer<typeof CorruptVariantSchema>;

// A telegraphed shockwave a boss unleashes as it enters a new phase — damages
// the player if they're inside `radius`. A "get out and reposition" beat that
// makes phase transitions about movement, not just DPS.
export const NovaSchema = z.object({
  damage: z.number().positive(),
  radius: z.number().positive(),
});

// A boss phase (m4.x): once the boss's HP fraction drops to/below `hpPct`, it
// transitions — recolours, may release a nova, adjusts speed/damage, and layers
// in the phase's attack patterns (a different fight, not just bigger HP). Pattern
// fields set here are added to the boss's current move-set on entry; leave a
// field out to keep whatever the boss already had.
export const BossPhaseSchema = z.object({
  hpPct: z.number().min(0).max(1), // enter at/below this HP fraction
  name: z.string().optional(), // banner shown on entry ("SUNDERED")
  tint: z.string().optional(), // sprite recolour for the phase (hex)
  spdMult: z.number().positive().optional(),
  dmgMult: z.number().positive().optional(),
  novaOnEnter: NovaSchema.optional(),
  slam: SlamSchema.optional(),
  charge: ChargeSchema.optional(),
  ranged: RangedSchema.optional(),
  explode: ExplodeSchema.optional(),
  summon: SummonSchema.optional(),
  poison: PoisonAttackSchema.optional(),
  hazard: HazardSchema.optional(),
  aggro: z.number().nonnegative().optional(),
  keepDistance: z.number().positive().optional(),
});
export type BossPhase = z.infer<typeof BossPhaseSchema>;

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
  poison: PoisonAttackSchema.optional(), // poison-touch DoT on hit (m4)
  hazard: HazardSchema.optional(), // ground-hazard zone denial (m4.x world bosses)
  aura: AuraSchema.optional(), // pack-leader buff aura (m4, Desert Empire)
  corrupt: CorruptVariantSchema.optional(), // corrupted spawn variant (m3)
  phases: z.array(BossPhaseSchema).optional(), // multi-phase boss fight (m4.x)
});
export type EnemyData = z.infer<typeof EnemySchema>;

export const EnemiesFileSchema = z.array(EnemySchema);
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
