import { z } from 'zod';

// NPC roster (Milestone 2.2). NPCs are placed data-first (zone + x/y) rather
// than in the Tiled maps, so a content author adds a townsperson or quest-giver
// purely in JSON. `dialogue` points at a tree id in dialogue.json; `offersQuests`
// drives the ! / ? indicator over their head.
export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  sprite: z.string(), // procedural sprite key (falls back if unknown)
  zone: z.string(), // zone id this NPC stands in
  x: z.number(),
  y: z.number(),
  dialogue: z.string(), // dialogue tree id
  wander: z.boolean().default(false), // idle wander around the spawn point
  offersQuests: z.array(z.string()).default([]), // quest ids for the ! / ? marker
  service: z.enum(['vendor', 'blacksmith', 'stash', 'trainer']).optional(), // opens a service UI on interact
  faction: z.string().optional(), // a vendor's faction: its stock unlocks with your rep (m2.4)
  // Scripted town changes per corruption tier (m3), evaluated at zone load:
  hideAboveCorruption: z.number().optional(), // vanish when world corruption ≥ this
  showAboveCorruption: z.number().optional(), // only appear when world corruption ≥ this
  prop: z.boolean().default(false), // a non-interactive decoration (e.g. boarded-up door), no name/prompt/talk
});
export type NpcData = z.infer<typeof NpcSchema>;

export const NpcsFileSchema = z.array(NpcSchema);
export type NpcsFile = z.infer<typeof NpcsFileSchema>;
