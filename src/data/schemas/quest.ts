import { z } from 'zod';

// Schema for Milestone 2.1's quest system. No prototype content exists to
// port (the prototype has no quests) — this defines the shape ahead of that
// milestone so content authors can start writing quests in data whenever the
// quest system lands. data/quests.json is an empty array until then.
export const QuestObjectiveTypeSchema = z.enum(['kill', 'collect', 'talkTo', 'reach']);
export type QuestObjectiveType = z.infer<typeof QuestObjectiveTypeSchema>;

export const QuestObjectiveSchema = z.object({
  type: QuestObjectiveTypeSchema,
  target: z.string(), // enemy id / item id / npc id / zone id, per type
  count: z.number().int().positive().default(1),
});
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

export const QuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  objectives: z.array(QuestObjectiveSchema).min(1),
  rewards: z.object({
    xp: z.number().nonnegative().default(0),
    gold: z.number().nonnegative().default(0),
    itemIds: z.array(z.string()).default([]),
    faction: z.string().optional(), // faction to award rep to on completion (m2.4)
    rep: z.number().nonnegative().default(0),
  }),
  prerequisites: z.array(z.string()).default([]), // quest ids that must be completed first
  chain: z.string().optional(), // groups quests into a story chain
  autoOffer: z.boolean().default(true), // false = only started by an NPC dialogue action
});
export type QuestData = z.infer<typeof QuestSchema>;

export const QuestsFileSchema = z.array(QuestSchema);
export type QuestsFile = z.infer<typeof QuestsFileSchema>;
