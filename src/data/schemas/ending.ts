import { z } from 'zod';

// Ending branch (Milestone 3). The three-way finale — Destroy / Control / Become
// — offered at the Shrine of Ashes once every relic fragment is collected. Fully
// data-driven: the required relics and each ending's screen text live here.
export const EndingPathSchema = z.object({
  id: z.string(), // 'destroy' | 'control' | 'become' (referenced by a dialogue action)
  choice: z.string(), // the shrine dialogue choice label
  title: z.string(), // end-screen heading
  text: z.string(), // end-screen body
});
export type EndingPath = z.infer<typeof EndingPathSchema>;

export const EndingsFileSchema = z.object({
  requiredRelics: z.array(z.string()), // all must be collected to unlock the choice
  paths: z.array(EndingPathSchema),
});
export type EndingsFile = z.infer<typeof EndingsFileSchema>;
