import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import { emptyQuestState } from './save/schema.ts';
import {
  availableQuests,
  completeQuest,
  isComplete,
  recordEvent,
  startAvailable,
  startQuest,
} from './quests.ts';

const quests = loadGameData().quests;

describe('availableQuests / prerequisites', () => {
  it('offers only prerequisite-free quests at the start', () => {
    const avail = availableQuests(quests, emptyQuestState()).map((q) => q.id);
    expect(avail).toContain('q_cull_slimes');
    expect(avail).not.toContain('q_into_the_barrow'); // needs q_cull_slimes done
  });

  it('unlocks a follow-up once its prerequisite is completed', () => {
    const state = { ...emptyQuestState(), completed: ['q_cull_slimes'] };
    const avail = availableQuests(quests, state).map((q) => q.id);
    expect(avail).toContain('q_into_the_barrow');
    expect(avail).not.toContain('q_cull_slimes'); // already done
  });
});

describe('startQuest', () => {
  it('adds to active, zero-fills progress, and auto-pins the first', () => {
    const s = startQuest(quests, emptyQuestState(), 'q_cull_slimes');
    expect(s.active).toEqual(['q_cull_slimes']);
    expect(s.progress['q_cull_slimes']).toEqual([0]);
    expect(s.tracked).toBe('q_cull_slimes');
  });

  it('is idempotent and never mutates the input', () => {
    const base = emptyQuestState();
    const s1 = startQuest(quests, base, 'q_cull_slimes');
    const s2 = startQuest(quests, s1, 'q_cull_slimes');
    expect(s2.active).toEqual(['q_cull_slimes']);
    expect(base.active).toEqual([]); // untouched
  });
});

describe('recordEvent', () => {
  it('advances a matching kill objective, capped at the count', () => {
    let s = startQuest(quests, emptyQuestState(), 'q_cull_slimes');
    for (let i = 0; i < 3; i++) s = recordEvent(quests, s, { type: 'kill', target: 'slime' }).state;
    expect(s.progress['q_cull_slimes']).toEqual([3]);
    expect(isComplete(quests.find((q) => q.id === 'q_cull_slimes')!, s)).toBe(false);
  });

  it('ignores non-matching events', () => {
    const s0 = startQuest(quests, emptyQuestState(), 'q_cull_slimes');
    const r = recordEvent(quests, s0, { type: 'kill', target: 'bat' });
    expect(r.state).toBe(s0); // unchanged reference when nothing advanced
    expect(r.completed).toEqual([]);
  });

  it('auto-completes a quest and reports it when the last objective is met', () => {
    let s = startQuest(quests, emptyQuestState(), 'q_cull_slimes');
    let done: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = recordEvent(quests, s, { type: 'kill', target: 'slime' });
      s = r.state;
      done = done.concat(r.completed.map((q) => q.id));
    }
    expect(done).toEqual(['q_cull_slimes']);
    expect(s.completed).toContain('q_cull_slimes');
    expect(s.active).not.toContain('q_cull_slimes');
  });

  it('needs every objective of a multi-objective quest', () => {
    let s = startQuest(quests, emptyQuestState(), 'q_slay_rotfang');
    for (let i = 0; i < 4; i++) s = recordEvent(quests, s, { type: 'kill', target: 'skel' }).state;
    expect(s.completed).not.toContain('q_slay_rotfang'); // boss not yet slain
    const r = recordEvent(quests, s, { type: 'kill', target: 'boss' });
    expect(r.completed.map((q) => q.id)).toEqual(['q_slay_rotfang']);
  });

  it('a reach event completes the barrow quest', () => {
    const s = startQuest(quests, emptyQuestState(), 'q_into_the_barrow');
    const r = recordEvent(quests, s, { type: 'reach', target: 'dungeon' });
    expect(r.completed.map((q) => q.id)).toEqual(['q_into_the_barrow']);
  });
});

describe('startAvailable + chain flow', () => {
  it('auto-starts the next quest in a chain after completing the prior', () => {
    let s = startAvailable(quests, emptyQuestState());
    expect(s.active).toContain('q_cull_slimes');
    expect(s.active).not.toContain('q_into_the_barrow');
    // finish the first quest, then re-offer
    s = completeQuest(s, 'q_cull_slimes');
    s = startAvailable(quests, s);
    expect(s.active).toContain('q_into_the_barrow');
  });

  it('does NOT auto-start an NPC-given (autoOffer:false) quest', () => {
    // q_elder_hunt is NPC-given; even once its prereq clears, auto-offer skips it.
    const s = startAvailable(quests, { ...emptyQuestState(), completed: ['q_meet_elder'] });
    expect(availableQuests(quests, { ...emptyQuestState(), completed: ['q_meet_elder'] }).map((q) => q.id)).toContain(
      'q_elder_hunt',
    );
    expect(s.active).not.toContain('q_elder_hunt');
  });
});
