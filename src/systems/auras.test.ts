import { describe, it, expect } from 'vitest';
import { packAuraAt, type AuraSource } from './auras';

const src = (x: number, y: number, radius: number, dmgMult = 1, spdMult = 1): AuraSource => ({ x, y, radius, dmgMult, spdMult });

describe('packAuraAt', () => {
  it('returns no buff when there are no sources', () => {
    expect(packAuraAt([], 0, 0)).toEqual({ dmgMult: 1, spdMult: 1 });
  });

  it('returns no buff when the ally is outside every aura', () => {
    expect(packAuraAt([src(0, 0, 10, 2, 2)], 100, 0)).toEqual({ dmgMult: 1, spdMult: 1 });
  });

  it('applies a single leader’s aura inside its radius (edge counts)', () => {
    expect(packAuraAt([src(0, 0, 10, 1.5, 1.4)], 6, 8)).toEqual({ dmgMult: 1.5, spdMult: 1.4 }); // d = 10, on the edge
  });

  it('stacks overlapping auras multiplicatively', () => {
    const sources = [src(0, 0, 50, 1.5, 1.2), src(10, 0, 50, 2, 1.5)];
    const buff = packAuraAt(sources, 5, 0);
    expect(buff.dmgMult).toBeCloseTo(3, 6); // 1.5 × 2
    expect(buff.spdMult).toBeCloseTo(1.8, 6); // 1.2 × 1.5
  });

  it('only counts the auras that actually reach the point', () => {
    const near = src(0, 0, 20, 2, 2);
    const far = src(500, 500, 20, 3, 3);
    expect(packAuraAt([near, far], 1, 1)).toEqual({ dmgMult: 2, spdMult: 2 });
  });

  it('defaults each axis to 1 so a speed-only aura leaves damage untouched', () => {
    expect(packAuraAt([src(0, 0, 30, 1, 1.6)], 0, 0)).toEqual({ dmgMult: 1, spdMult: 1.6 });
  });

  it('does not mutate the sources', () => {
    const sources = [src(0, 0, 30, 1.5, 1.5)];
    const snapshot = JSON.parse(JSON.stringify(sources));
    packAuraAt(sources, 0, 0);
    expect(sources).toEqual(snapshot);
  });
});
