import { describe, expect, it } from 'vitest';
import { fanAngles, nearestTarget } from './projectiles.ts';

describe('fanAngles', () => {
  it('returns the base angle for a single projectile', () => {
    expect(fanAngles(1, 1, 0.6)).toEqual([1]);
  });

  it('spreads evenly and symmetrically around the base', () => {
    const a = fanAngles(0, 3, 1);
    expect(a).toEqual([-0.5, 0, 0.5]);
  });

  it('handles an even count (no shot exactly on the base)', () => {
    const a = fanAngles(0, 2, 1);
    expect(a).toEqual([-0.5, 0.5]);
  });
});

describe('nearestTarget', () => {
  const mk = (id: number, x: number, y: number) => ({ id, x, y });
  const enemies = [mk(1, 10, 0), mk(2, 30, 0), mk(3, 5, 0)];

  it('finds the closest candidate in range', () => {
    expect(nearestTarget({ x: 0, y: 0 }, enemies, new Set(), 100)?.id).toBe(3);
  });

  it('skips excluded ids (already chained)', () => {
    expect(nearestTarget({ x: 0, y: 0 }, enemies, new Set([3]), 100)?.id).toBe(1);
    expect(nearestTarget({ x: 0, y: 0 }, enemies, new Set([3, 1]), 100)?.id).toBe(2);
  });

  it('returns null when everything is out of range', () => {
    expect(nearestTarget({ x: 0, y: 0 }, enemies, new Set(), 4)).toBeNull();
  });

  it('returns null when all candidates are excluded', () => {
    expect(nearestTarget({ x: 0, y: 0 }, enemies, new Set([1, 2, 3]), 100)).toBeNull();
  });
});
