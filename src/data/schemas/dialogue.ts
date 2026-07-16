import { z } from 'zod';

// Schema for Milestone 2.2's NPC/dialogue system. No prototype content
// exists to port — this defines the shape ahead of that milestone.
// data/dialogue.json is an empty array until then.
export const DialogueChoiceSchema = z.object({
  text: z.string(),
  nextNodeId: z.string().optional(), // omitted ends the conversation
  setsFlag: z.string().optional(),
  requiresFlag: z.string().optional(),
});

export const DialogueNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  choices: z.array(DialogueChoiceSchema).default([]),
});

export const DialogueTreeSchema = z.object({
  id: z.string(), // usually the NPC id
  startNodeId: z.string(),
  nodes: z.array(DialogueNodeSchema).min(1),
});
export type DialogueTreeData = z.infer<typeof DialogueTreeSchema>;

export const DialogueFileSchema = z.array(DialogueTreeSchema);
export type DialogueFile = z.infer<typeof DialogueFileSchema>;
