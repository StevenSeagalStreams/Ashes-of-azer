import { describe, expect, it } from 'vitest';
import { NO_POISON, POISON_TICK, applyPoison, tickPoison, type Poison } from './status.ts';

describe('applyPoison', () => {
  it('starts a fresh poison with a full first-tick delay', () => {
    const p = applyPoison(NO_POISON, 20, 3);
    expect(p.dps).toBe(20);
    expect(p.remaining).toBe(3);
    expect(p.tick).toBe(POISON_TICK);
  });

  it('refreshes with the stronger dps and the longer duration (no unbounded stacking)', () => {
    const weak: Poison = { dps: 10, remaining: 1, tick: 0.3 };
    const strong = applyPoison(weak, 25, 4);
    expect(strong.dps).toBe(25);
    expect(strong.remaining).toBe(4);
    expect(strong.tick).toBe(0.3); // an already-active poison keeps its running tick
    // A weaker/shorter reapply cannot reduce an active poison.
    const kept = applyPoison(strong, 5, 1);
    expect(kept.dps).toBe(25);
    expect(kept.remaining).toBe(4);
  });

  it('ignores non-positive applications', () => {
    expect(applyPoison(NO_POISON, 0, 3)).toBe(NO_POISON);
    expect(applyPoison(NO_POISON, 10, 0)).toBe(NO_POISON);
  });
});

describe('tickPoison', () => {
  it('is inert with no active poison', () => {
    const step = tickPoison(NO_POISON, 0.1);
    expect(step.damage).toBe(0);
    expect(step.poison).toBe(NO_POISON);
  });

  it('lands damage on each 0.5s tick, not between', () => {
    let p = applyPoison(NO_POISON, 20, 3);
    let s = tickPoison(p, 0.3); // 0.3s in — no tick yet
    expect(s.damage).toBe(0);
    p = s.poison;
    s = tickPoison(p, 0.3); // 0.6s cumulative — a tick lands
    expect(s.damage).toBe(10); // 20 dps * 0.5s
  });

  it('deals roughly dps*duration total, then expires to NO_POISON', () => {
    let p = applyPoison(NO_POISON, 20, 3);
    let total = 0;
    // Simulate ~4s at 60fps; poison should stop after its 3s window.
    for (let i = 0; i < 240; i++) {
      const s = tickPoison(p, 1 / 60);
      total += s.damage;
      p = s.poison;
    }
    expect(p).toBe(NO_POISON);
    // 3s of 20 dps ≈ 60 (6 ticks of 10); allow a tick of slack for boundary rounding.
    expect(total).toBeGreaterThanOrEqual(50);
    expect(total).toBeLessThanOrEqual(70);
  });

  it('never deals less than 1 per tick for a very weak poison', () => {
    const p = applyPoison(NO_POISON, 1, 2);
    const s = tickPoison(p, POISON_TICK);
    expect(s.damage).toBe(1); // round(0.5) would be 0/1 — floored at 1
  });
});
