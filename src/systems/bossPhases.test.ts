import { describe, it, expect } from 'vitest';
import { sortPhases, advancePhase, mergePhaseDef } from './bossPhases';
import type { BossPhase, EnemyData } from '../data/schemas/index.ts';

const base: EnemyData = {
  id: 'boss',
  sprite: 'boss',
  hp: 400,
  dmg: 16,
  spd: 30,
  xp: 100,
  aggro: 999,
  width: 16,
  height: 12,
  boss: true,
  slam: { interval: 4.5, damage: 22, radius: 64 },
};

const p2: BossPhase = { hpPct: 0.6, name: 'TWO', summon: { minion: 'skel', count: 2, interval: 6, max: 4 } };
const p3: BossPhase = { hpPct: 0.3, name: 'THREE', charge: { range: 200, windup: 0.5, speed: 300, duration: 0.5, cooldown: 3 } };

describe('sortPhases', () => {
  it('orders phases first-crossed-first (descending hpPct)', () => {
    const sorted = sortPhases([p3, p2]);
    expect(sorted.map((p) => p.hpPct)).toEqual([0.6, 0.3]);
  });
  it('does not mutate the input', () => {
    const input = [p3, p2];
    sortPhases(input);
    expect(input.map((p) => p.hpPct)).toEqual([0.3, 0.6]);
  });
});

describe('advancePhase', () => {
  const phases = sortPhases([p2, p3]);

  it('stays put above the first threshold', () => {
    expect(advancePhase(phases, 1.0, 0)).toBe(0);
    expect(advancePhase(phases, 0.61, 0)).toBe(0);
  });

  it('enters the first phase at/below its hpPct', () => {
    expect(advancePhase(phases, 0.6, 0)).toBe(1);
    expect(advancePhase(phases, 0.45, 0)).toBe(1);
  });

  it('advances straight to the deepest phase when a big hit crosses several', () => {
    expect(advancePhase(phases, 0.1, 0)).toBe(2); // skipped past phase 1 in one blow
  });

  it('never re-enters or moves backward once entered', () => {
    expect(advancePhase(phases, 0.5, 1)).toBe(1); // already in phase 1, still there
    expect(advancePhase(phases, 0.9, 2)).toBe(2); // fully phased, healing can't undo it
  });

  it('caps at the number of phases', () => {
    expect(advancePhase(phases, 0.0, 0)).toBe(2);
    expect(advancePhase(phases, 0.0, 2)).toBe(2);
  });
});

describe('mergePhaseDef', () => {
  it('overlays a phase pattern onto the base, keeping other fields', () => {
    const merged = mergePhaseDef(base, p2);
    expect(merged.summon).toEqual(p2.summon);
    expect(merged.slam).toEqual(base.slam); // untouched
    expect(merged.hp).toBe(base.hp);
    expect(merged.boss).toBe(true);
  });

  it('replaces a pattern the phase re-specifies', () => {
    const stronger: BossPhase = { hpPct: 0.5, slam: { interval: 3, damage: 30, radius: 80 } };
    const merged = mergePhaseDef(base, stronger);
    expect(merged.slam).toEqual(stronger.slam);
    expect(merged.slam).not.toEqual(base.slam);
  });

  it('does not carry presentation-only fields (tint/name/mults) onto the def', () => {
    const phase: BossPhase = { hpPct: 0.5, name: 'X', tint: '#ffffff', spdMult: 1.5, dmgMult: 1.5 };
    const merged = mergePhaseDef(base, phase) as Record<string, unknown>;
    expect(merged.name).toBe(base.name); // undefined — not the phase's banner
    expect(merged.tint).toBeUndefined();
    expect(merged.spdMult).toBeUndefined();
    expect(merged.dmgMult).toBeUndefined();
  });

  it('is cumulative when applied in sequence (adds each phase move-set)', () => {
    const afterP2 = mergePhaseDef(base, p2);
    const afterP3 = mergePhaseDef(afterP2, p3);
    expect(afterP3.summon).toEqual(p2.summon); // kept from phase 2
    expect(afterP3.charge).toEqual(p3.charge); // added by phase 3
    expect(afterP3.slam).toEqual(base.slam); // original still present
  });

  it('does not mutate the base def', () => {
    mergePhaseDef(base, p2);
    expect(base.summon).toBeUndefined();
  });
});
