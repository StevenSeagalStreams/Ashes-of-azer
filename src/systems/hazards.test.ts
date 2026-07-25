import { describe, it, expect } from 'vitest';
import { hazardSpots, inHazard } from './hazards';

/** Deterministic RNG replaying a fixed script, clamped to [0,1). */
function scriptRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('hazardSpots', () => {
  it('always drops the first pool exactly on the target', () => {
    const spots = hazardSpots(100, 50, 3, 60, scriptRng([0.1, 0.2, 0.3, 0.4]));
    expect(spots[0]).toEqual({ x: 100, y: 50 });
  });

  it('returns exactly `count` spots (min 1)', () => {
    expect(hazardSpots(0, 0, 1, 40, scriptRng([0.5])).length).toBe(1);
    expect(hazardSpots(0, 0, 4, 40, scriptRng([0.5])).length).toBe(4);
    expect(hazardSpots(0, 0, 0, 40, scriptRng([0.5])).length).toBe(1); // clamps up
  });

  it('scatters extras within [0.4, 1.0] * spread of the centre', () => {
    const spread = 80;
    const spots = hazardSpots(0, 0, 6, spread, Math.random);
    for (let i = 1; i < spots.length; i++) {
      const d = Math.hypot(spots[i]!.x, spots[i]!.y);
      expect(d).toBeGreaterThanOrEqual(spread * 0.4 - 1e-9);
      expect(d).toBeLessThanOrEqual(spread + 1e-9);
    }
  });

  it('is deterministic for a given rng script', () => {
    const a = hazardSpots(10, 20, 3, 50, scriptRng([0.25, 0.75, 0.5, 0.9]));
    const b = hazardSpots(10, 20, 3, 50, scriptRng([0.25, 0.75, 0.5, 0.9]));
    expect(a).toEqual(b);
  });
});

describe('inHazard', () => {
  it('is true inside and on the edge, false outside', () => {
    expect(inHazard(0, 0, 0, 0, 10)).toBe(true); // dead centre
    expect(inHazard(6, 8, 0, 0, 10)).toBe(true); // exactly on the edge (d=10)
    expect(inHazard(7, 8, 0, 0, 10)).toBe(false); // d≈10.6 — just outside
  });

  it('accounts for the hazard centre offset', () => {
    expect(inHazard(100, 100, 105, 100, 8)).toBe(true);
    expect(inHazard(100, 100, 120, 100, 8)).toBe(false);
  });
});
