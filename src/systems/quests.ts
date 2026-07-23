// Pure quest-progress engine (Milestone 2.1). All functions are immutable —
// they take a QuestState + the quest catalog and return a new state, so the
// scene just swaps the save's `quests` field and everything (journal, tracker,
// save) reads from one source of truth. Unit-tested; no Phaser here.

import type { QuestData, QuestObjectiveType } from '../data/schemas/index.ts';
import type { QuestState } from './save/schema.ts';

/** A gameplay event that can advance objectives (a kill, a zone entered, …). */
export interface QuestEvent {
  type: QuestObjectiveType;
  target: string; // enemy id / item id / npc id / zone id
  amount?: number; // default 1
}

const clone = (s: QuestState): QuestState => ({
  active: [...s.active],
  completed: [...s.completed],
  progress: Object.fromEntries(Object.entries(s.progress).map(([k, v]) => [k, [...v]])),
  tracked: s.tracked,
});

const byId = (quests: readonly QuestData[]): Map<string, QuestData> =>
  new Map(quests.map((q) => [q.id, q]));

/** Quests not started/finished whose prerequisites are all completed. */
export function availableQuests(quests: readonly QuestData[], state: QuestState): QuestData[] {
  const done = new Set(state.completed);
  const active = new Set(state.active);
  return quests.filter(
    (q) => !done.has(q.id) && !active.has(q.id) && q.prerequisites.every((p) => done.has(p)),
  );
}

/** True once every objective's count is met. */
export function isComplete(quest: QuestData, state: QuestState): boolean {
  const p = state.progress[quest.id];
  if (!p) return false;
  return quest.objectives.every((obj, i) => (p[i] ?? 0) >= obj.count);
}

/** Starts a quest (idempotent): adds it to active and zero-fills its progress. */
export function startQuest(quests: readonly QuestData[], state: QuestState, questId: string): QuestState {
  const quest = byId(quests).get(questId);
  if (!quest) return state;
  if (state.active.includes(questId) || state.completed.includes(questId)) return state;
  const next = clone(state);
  next.active.push(questId);
  next.progress[questId] = quest.objectives.map(() => 0);
  if (next.tracked === null) next.tracked = questId; // auto-pin the first quest
  return next;
}

/**
 * Auto-starts every available quest flagged `autoOffer` (the default). Quests
 * with `autoOffer: false` are NPC-given and only start via a dialogue action,
 * even though they still count as "available" for markers/conditions.
 */
export function startAvailable(quests: readonly QuestData[], state: QuestState): QuestState {
  let next = state;
  for (const q of availableQuests(quests, next)) if (q.autoOffer) next = startQuest(quests, next, q.id);
  return next;
}

/** Moves a quest from active to completed and clears its tracked pin. */
export function completeQuest(state: QuestState, questId: string): QuestState {
  if (!state.active.includes(questId)) return state;
  const next = clone(state);
  next.active = next.active.filter((id) => id !== questId);
  if (!next.completed.includes(questId)) next.completed.push(questId);
  if (next.tracked === questId) next.tracked = next.active[0] ?? null;
  return next;
}

export interface RecordResult {
  state: QuestState;
  completed: QuestData[]; // quests that finished as a result of this event
}

/**
 * Applies an event to every active quest, advancing matching objectives (capped
 * at each objective's count) and auto-completing any quest whose objectives are
 * now all met. Returns the new state and the quests that just completed (so the
 * scene can grant rewards and toast the player).
 */
export function recordEvent(
  quests: readonly QuestData[],
  state: QuestState,
  event: QuestEvent,
): RecordResult {
  const catalog = byId(quests);
  const amount = event.amount ?? 1;
  let next = clone(state);
  let changed = false;

  for (const questId of state.active) {
    const quest = catalog.get(questId);
    if (!quest) continue;
    const p = next.progress[questId] ?? quest.objectives.map(() => 0);
    quest.objectives.forEach((obj, i) => {
      if (obj.type === event.type && obj.target === event.target && (p[i] ?? 0) < obj.count) {
        p[i] = Math.min(obj.count, (p[i] ?? 0) + amount);
        changed = true;
      }
    });
    next.progress[questId] = p;
  }
  if (!changed) return { state, completed: [] };

  const completed: QuestData[] = [];
  for (const questId of [...next.active]) {
    const quest = catalog.get(questId);
    if (quest && isComplete(quest, next)) {
      next = completeQuest(next, questId);
      completed.push(quest);
    }
  }
  return { state: next, completed };
}
