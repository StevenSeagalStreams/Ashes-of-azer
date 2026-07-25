import { z } from 'zod';

// NPC/dialogue system (Milestone 2.2). A tree is a set of nodes; each node has
// text and choices. A choice may be gated by a `condition` (quest state, flags,
// corruption) and may fire an `action` (set a flag, start a quest) before
// jumping to its `nextNodeId` (omitted = end the conversation).

// Visibility gate for a choice. All present sub-conditions must hold.
export const DialogueConditionSchema = z.object({
  flag: z.string().optional(), // questFlags[flag] is truthy
  notFlag: z.string().optional(), // questFlags[flag] is falsy/absent
  questActive: z.string().optional(),
  questCompleted: z.string().optional(),
  questAvailable: z.string().optional(), // prereqs met, not active/completed
  corruptionMin: z.number().optional(),
  corruptionMax: z.number().optional(),
});
export type DialogueCondition = z.infer<typeof DialogueConditionSchema>;

export const DialogueActionSchema = z.object({
  setsFlag: z.string().optional(),
  startsQuest: z.string().optional(),
  respec: z.boolean().optional(), // trainer: reset skill points + passive slots
  ending: z.string().optional(), // m3 ending branch: seals a Destroy/Control/Become ending
});
export type DialogueAction = z.infer<typeof DialogueActionSchema>;

export const DialogueChoiceSchema = z.object({
  text: z.string(),
  nextNodeId: z.string().optional(), // omitted ends the conversation
  condition: DialogueConditionSchema.optional(),
  action: DialogueActionSchema.optional(),
});
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

export const DialogueNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  choices: z.array(DialogueChoiceSchema).default([]),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueTreeSchema = z.object({
  id: z.string(), // usually the NPC id
  startNodeId: z.string(),
  nodes: z.array(DialogueNodeSchema).min(1),
});
export type DialogueTreeData = z.infer<typeof DialogueTreeSchema>;

export const DialogueFileSchema = z.array(DialogueTreeSchema);
export type DialogueFile = z.infer<typeof DialogueFileSchema>;
