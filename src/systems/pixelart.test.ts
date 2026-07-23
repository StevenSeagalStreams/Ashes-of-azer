import { describe, expect, it } from 'vitest';
import { BAT_ROWS, DEFAULT_ENEMY_ROWS, SLIME_ROWS, spriteRowsFor } from './pixelart.ts';

describe('spriteRowsFor', () => {
  it('returns dedicated art for known sprite keys', () => {
    expect(spriteRowsFor('slime')).toBe(SLIME_ROWS);
    expect(spriteRowsFor('bat')).toBe(BAT_ROWS);
  });

  it('falls back to a generic sprite for an unknown key', () => {
    // Proves a brand new enemy with no dedicated art still renders instead
    // of crashing — required for "add an enemy via JSON only" to hold when
    // the new enemy doesn't reuse an existing sprite key.
    expect(spriteRowsFor('some-future-enemy-nobody-drew-yet')).toBe(DEFAULT_ENEMY_ROWS);
  });
});
