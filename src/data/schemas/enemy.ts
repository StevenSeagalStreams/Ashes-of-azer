import { z } from 'zod';

// Ported from the prototype's ETYPES (slime/bat/skel/boss). This is the
// authoritative enemy roster — adding a new enemy type means adding an
// entry to data/enemies.json, nothing else.
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
  // Periodic AoE ground slam (prototype: Rotfang, every 4.5s, 22 dmg, 64px).
  slam: z
    .object({
      interval: z.number().positive(),
      damage: z.number().positive(),
      radius: z.number().positive(),
    })
    .optional(),
  // ---- Distinct attack patterns (m2.4). All optional + data-driven. ----
  // A kiter keeps this many px between itself and the player (backs away when
  // closer, holds at range). Pairs naturally with `ranged`.
  keepDistance: z.number().positive().optional(),
  // Charger: telegraph, then dash toward the player's locked position at `speed`
  // for `duration`s; contact during the dash lands `dmg`. Then waits `cooldown`.
  charge: z
    .object({
      range: z.number().positive(), // start a charge when the player is within this
      windup: z.number().positive(), // telegraph time before the dash
      speed: z.number().positive(), // dash speed (px/s)
      duration: z.number().positive(), // how long the dash lasts
      cooldown: z.number().positive(),
    })
    .optional(),
  // Ranged: fire a projectile at the player when within `range`, every `cooldown`.
  ranged: z
    .object({
      range: z.number().positive(),
      cooldown: z.number().positive(),
      damage: z.number().positive(),
      projectileSpeed: z.number().positive(),
    })
    .optional(),
  // Exploder: rush in, and within `range` telegraph then self-destruct, dealing
  // `damage` to the player inside `radius`. Dies on detonation.
  explode: z
    .object({
      range: z.number().positive(),
      windup: z.number().positive(),
      damage: z.number().positive(),
      radius: z.number().positive(),
    })
    .optional(),
  // Summoner: every `interval`s, call up `count` minions (enemy id `minion`),
  // never exceeding `max` of its own living summons.
  summon: z
    .object({
      minion: z.string(),
      count: z.number().int().positive(),
      interval: z.number().positive(),
      max: z.number().int().positive(),
    })
    .optional(),
});
export type EnemyData = z.infer<typeof EnemySchema>;

export const EnemiesFileSchema = z.array(EnemySchema);
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
