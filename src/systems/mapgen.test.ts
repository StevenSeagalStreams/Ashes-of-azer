import { describe, expect, it } from 'vitest';
import { TS, walkableMask } from './mapgen.ts';

describe('walkableMask', () => {
  // 4x4 tiles: solid border, clear 2x2 centre.
  const T = true;
  const o = false;
  const mask = [
    [T, T, T, T],
    [T, o, o, T],
    [T, o, o, T],
    [T, T, T, T],
  ];

  it('accepts a point in the clear centre', () => {
    expect(walkableMask(mask, 2 * TS, 2 * TS, 5)).toBe(true);
  });

  it('rejects a point on a solid tile', () => {
    expect(walkableMask(mask, 8, 8, 5)).toBe(false);
  });

  it('rejects a point whose radius pokes into a solid tile', () => {
    // Centre of tile (1,1) is clear, but radius reaches into the border.
    expect(walkableMask(mask, TS + 2, TS + 8, 5)).toBe(false);
  });

  it('treats out-of-bounds as solid', () => {
    expect(walkableMask(mask, -20, -20, 5)).toBe(false);
    expect(walkableMask(mask, 10 * TS, 2 * TS, 5)).toBe(false);
  });
});
