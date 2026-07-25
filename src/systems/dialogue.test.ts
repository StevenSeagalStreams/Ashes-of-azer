import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import { emptyQuestState } from './save/schema.ts';
import { startQuest } from './quests.ts';
import { evalCondition, nodeById, questMarker, visibleChoices, type DialogueContext } from './dialogue.ts';

const data = loadGameData();
const catalog = data.quests;
const elder = data.dialogue.find((t) => t.id === 'elder')!;

const ctx = (overrides: Partial<DialogueContext> = {}): DialogueContext => ({
  flags: {},
  quests: emptyQuestState(),
  catalog,
  corruption: 0,
  ...overrides,
});

describe('evalCondition', () => {
  it('gates on a flag being set / not set', () => {
    expect(evalCondition({ flag: 'met' }, ctx({ flags: { met: true } }))).toBe(true);
    expect(evalCondition({ flag: 'met' }, ctx())).toBe(false);
    expect(evalCondition({ notFlag: 'met' }, ctx())).toBe(true);
    expect(evalCondition({ notFlag: 'met' }, ctx({ flags: { met: true } }))).toBe(false);
  });

  it('gates on quest active / completed / available', () => {
    const active = { ...emptyQuestState(), active: ['q_cull_slimes'] };
    expect(evalCondition({ questActive: 'q_cull_slimes' }, ctx({ quests: active }))).toBe(true);
    const done = { ...emptyQuestState(), completed: ['q_meet_elder'] };
    expect(evalCondition({ questCompleted: 'q_meet_elder' }, ctx({ quests: done }))).toBe(true);
    // q_elder_hunt needs q_meet_elder completed → only then "available".
    expect(evalCondition({ questAvailable: 'q_elder_hunt' }, ctx())).toBe(false);
    expect(evalCondition({ questAvailable: 'q_elder_hunt' }, ctx({ quests: done }))).toBe(true);
  });

  it('gates on a corruption range', () => {
    expect(evalCondition({ corruptionMin: 50 }, ctx({ corruption: 60 }))).toBe(true);
    expect(evalCondition({ corruptionMin: 50 }, ctx({ corruption: 10 }))).toBe(false);
    expect(evalCondition({ corruptionMax: 20 }, ctx({ corruption: 10 }))).toBe(true);
  });

  it('requires ALL present sub-conditions', () => {
    const done = { ...emptyQuestState(), completed: ['q_meet_elder'] };
    expect(evalCondition({ questAvailable: 'q_elder_hunt', flag: 'met' }, ctx({ quests: done }))).toBe(false);
    expect(
      evalCondition({ questAvailable: 'q_elder_hunt', flag: 'met' }, ctx({ quests: done, flags: { met: true } })),
    ).toBe(true);
  });
});

describe('visibleChoices (Elder greet)', () => {
  const greet = nodeById(elder, 'greet')!;

  it('hides the accept-hunt choice until the hunt is available', () => {
    const texts = visibleChoices(greet, ctx()).map((c) => c.text);
    expect(texts.some((t) => /Accept/i.test(t))).toBe(false); // q_elder_hunt not available yet
    expect(texts).toContain('Who are you?');
  });

  it('offers the hunt once its prerequisite is met', () => {
    const done = { ...emptyQuestState(), completed: ['q_meet_elder'] };
    const texts = visibleChoices(greet, ctx({ quests: done })).map((c) => c.text);
    expect(texts.some((t) => /Accept/i.test(t))).toBe(true);
  });

  it('shows the in-progress line while the hunt is active', () => {
    const active = { ...emptyQuestState(), active: ['q_elder_hunt'] };
    const texts = visibleChoices(greet, ctx({ quests: active })).map((c) => c.text);
    expect(texts).toContain('The hunt goes on.');
  });
});

describe('questMarker', () => {
  const elderNpc = data.npcs.find((n) => n.id === 'elder')!;

  it("shows '?' when an offered quest is active (talk to me)", () => {
    const s = startQuest(catalog, emptyQuestState(), 'q_meet_elder');
    expect(questMarker(elderNpc.offersQuests, ctx({ quests: s }))).toBe('?');
  });

  it("shows '!' when an offered quest becomes available to accept", () => {
    const done = { ...emptyQuestState(), completed: ['q_meet_elder'] };
    expect(questMarker(elderNpc.offersQuests, ctx({ quests: done }))).toBe('!');
  });

  it('shows nothing once everything is handled', () => {
    const allDone = { ...emptyQuestState(), completed: ['q_meet_elder', 'q_elder_hunt'] };
    expect(questMarker(elderNpc.offersQuests, ctx({ quests: allDone }))).toBeNull();
  });
});
