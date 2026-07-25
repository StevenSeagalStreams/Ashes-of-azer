import { z } from 'zod';

// Ported from the prototype's MAPS (overworld/dungeon). Zone-specific fog
// tuning (`dark`) is already consumed by src/systems/fog.ts's isDarkZone
// parameter; wiring zones.json into scene selection is Milestone 0.5's job
// (Tiled maps + zone transitions), so `enemyTypes` isn't consumed yet either.
export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  dark: z.boolean(), // tighter, darker fog of war (src/systems/fog.ts)
  enemyTypes: z.array(z.string()), // enemy ids from enemies.json spawnable here
});
export type ZoneData = z.infer<typeof ZoneSchema>;

export const ZonesFileSchema = z.array(ZoneSchema);
export type ZonesFile = z.infer<typeof ZonesFileSchema>;
