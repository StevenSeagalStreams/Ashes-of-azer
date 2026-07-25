import { describe, expect, it } from 'vitest';
import { abilityReady, moveMode } from './enemyAI.ts';

describe('moveMode', () => {
  it('holds when out of aggro or right on top of the player', () => {
    expect(moveMode(200, 120)).toBe('hold'); // beyond aggro
    expect(moveMode(1, 120)).toBe('hold'); // essentially touching
  });

  it('chases a plain melee enemy that is in aggro range', () => {
    expect(moveMode(60, 120)).toBe('chase');
  });

  it('kites when a keepDistance enemy is too close, holds in-band, chases when far', () => {
    // keepDistance 100 → kite < 80, hold 80..120, chase > 120 (within aggro).
    expect(moveMode(50, 300, 100)).toBe('kite');
    expect(moveMode(100, 300, 100)).toBe('hold');
    expect(moveMode(200, 300, 100)).toBe('chase');
  });

  it('a kiter still holds when the player leaves aggro entirely', () => {
    expect(moveMode(400, 300, 100)).toBe('hold');
  });
});

describe('abilityReady', () => {
  it('needs both range and an elapsed cooldown', () => {
    expect(abilityReady(80, 120, 0)).toBe(true);
    expect(abilityReady(200, 120, 0)).toBe(false); // out of range
    expect(abilityReady(80, 120, 0.5)).toBe(false); // still cooling down
  });
});
