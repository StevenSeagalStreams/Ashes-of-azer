// Pure dialogue helpers (Milestone 2.2). The stateful conversation flow (which
// node you're on, applying a choice's action) lives in the scene/UI; this module
// holds the testable logic: evaluating a choice's visibility condition against
// the world state, and the quest marker (! / ?) shown over an NPC.

import type {
  DialogueChoice,
  DialogueCondition,
  DialogueNode,
  DialogueTreeData,
  QuestData,
} from '../data/schemas/index.ts';
import type { QuestState } from './save/schema.ts';
import { availableQuests } from './quests.ts';

export interface DialogueContext {
  flags: Record<string, boolean | number | string>;
  quests: QuestState;
  catalog: readonly QuestData[];
  corruption: number;
}

/** True when every present sub-condition of `cond` holds for the world state. */
export function evalCondition(cond: DialogueCondition, ctx: DialogueContext): boolean {
  if (cond.flag !== undefined && !ctx.flags[cond.flag]) return false;
  if (cond.notFlag !== undefined && ctx.flags[cond.notFlag]) return false;
  if (cond.questActive !== undefined && !ctx.quests.active.includes(cond.questActive)) return false;
  if (cond.questCompleted !== undefined && !ctx.quests.completed.includes(cond.questCompleted)) return false;
  if (cond.questAvailable !== undefined) {
    const avail = availableQuests(ctx.catalog as QuestData[], ctx.quests).some((q) => q.id === cond.questAvailable);
    if (!avail) return false;
  }
  if (cond.corruptionMin !== undefined && ctx.corruption < cond.corruptionMin) return false;
  if (cond.corruptionMax !== undefined && ctx.corruption > cond.corruptionMax) return false;
  return true;
}

/** The choices at `node` whose conditions currently pass. */
export const visibleChoices = (node: DialogueNode, ctx: DialogueContext): DialogueChoice[] =>
  node.choices.filter((c) => !c.condition || evalCondition(c.condition, ctx));

export const nodeById = (tree: DialogueTreeData, id: string): DialogueNode | undefined =>
  tree.nodes.find((n) => n.id === id);

/**
 * The marker floating over an NPC given the quests they're tied to:
 *  '!'  a quest they offer is available to accept,
 *  '?'  a quest they're tied to is active,
 *  null nothing to do here right now.
 */
export function questMarker(offersQuests: readonly string[], ctx: DialogueContext): '!' | '?' | null {
  const avail = new Set(availableQuests(ctx.catalog as QuestData[], ctx.quests).map((q) => q.id));
  if (offersQuests.some((id) => avail.has(id))) return '!';
  if (offersQuests.some((id) => ctx.quests.active.includes(id))) return '?';
  return null;
}
