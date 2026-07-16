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
});
export type EnemyData = z.infer<typeof EnemySchema>;

export const EnemiesFileSchema = z.array(EnemySchema);
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
