import { describe, expect, it } from 'vitest';
import { fogParams } from './fog.ts';

describe('fogParams', () => {
  it('matches the prototype overworld values', () => {
    expect(fogParams(false, 0)).toEqual({ radius: 100, darkness: 0.82 });
  });

  it('matches the prototype dungeon values (tighter, darker)', () => {
    expect(fogParams(true, 0)).toEqual({ radius: 62, darkness: 0.95 });
  });

  it('extends the sight radius with +Vision gear', () => {
    expect(fogParams(false, 45).radius).toBe(145);
    expect(fogParams(true, 15).radius).toBe(77);
  });
});
