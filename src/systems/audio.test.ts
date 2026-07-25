import { describe, expect, it } from 'vitest';
import { corruptionAudioParams } from './audio.ts';

describe('corruptionAudioParams', () => {
  it('is silent at zero corruption', () => {
    const p = corruptionAudioParams(0);
    expect(p.master).toBe(0);
    expect(p.diss).toBe(0);
  });

  it('swells louder and brighter as corruption rises', () => {
    const low = corruptionAudioParams(25);
    const high = corruptionAudioParams(100);
    expect(high.master).toBeGreaterThan(low.master);
    expect(high.cutoff).toBeGreaterThan(low.cutoff);
    expect(high.wobbleHz).toBeGreaterThan(low.wobbleHz);
  });

  it('dissonance only creeps in past the Tainted band (~25)', () => {
    expect(corruptionAudioParams(20).diss).toBe(0);
    expect(corruptionAudioParams(50).diss).toBeGreaterThan(0);
    expect(corruptionAudioParams(100).diss).toBeGreaterThan(corruptionAudioParams(50).diss);
  });

  it('keeps the ambience subtle even at max (never blares)', () => {
    expect(corruptionAudioParams(100).master).toBeLessThanOrEqual(0.15);
  });
});
