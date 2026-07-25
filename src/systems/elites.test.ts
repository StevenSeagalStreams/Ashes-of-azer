import { describe, it, expect } from 'vitest';
import { ELITE_MODS, ELITE_CHANCE, rollElite } from './elites';

/** Deterministic RNG that replays a fixed script of values, clamped to [0,1). */
function scriptRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('rollElite', () => {
  it('returns null when the chance roll fails', () => {
    // First draw >= chance → no elite (second draw never consulted).
    expect(rollElite(scriptRng([0.5]), 0.07)).toBeNull();
    expect(rollElite(scriptRng([0.07]), 0.07)).toBeNull(); // boundary: >= is a miss
  });

  it('returns a valid elite mod when the chance roll succeeds', () => {
    // First draw < chance → elite; second draw picks the index.
    const mod = rollElite(scriptRng([0.0, 0.0]), 0.07);
    expect(mod).not.toBeNull();
    expect(ELITE_MODS).toContain(mod);
  });

  it('selects the mod by the second draw across the whole table', () => {
    for (let i = 0; i < ELITE_MODS.length; i++) {
      // Land squarely inside bucket i: (i + 0.5) / length.
      const pick = (i + 0.5) / ELITE_MODS.length;
      const mod = rollElite(scriptRng([0.0, pick]), 1);
      expect(mod).toBe(ELITE_MODS[i]);
    }
  });

  it('never indexes out of bounds when the second draw is ~1', () => {
    const mod = rollElite(scriptRng([0.0, 0.999999]), 1);
    expect(mod).toBe(ELITE_MODS[ELITE_MODS.length - 1]);
  });

  it('is rare at the default chance over many rolls', () => {
    let hits = 0;
    const n = 20000;
    // Deterministic-ish uniform sweep so the ratio is stable.
    const rng = scriptRng(Array.from({ length: 97 }, (_, k) => k / 97));
    for (let i = 0; i < n; i++) if (rollElite(rng)) hits++;
    // Roughly ELITE_CHANCE; allow slack for the coarse script.
    expect(hits / n).toBeGreaterThan(0);
    expect(hits / n).toBeLessThan(ELITE_CHANCE * 2);
  });

  it('exposes a balanced-ish default chance and a full mod table', () => {
    expect(ELITE_CHANCE).toBeGreaterThan(0);
    expect(ELITE_CHANCE).toBeLessThan(0.2);
    expect(ELITE_MODS.length).toBeGreaterThanOrEqual(4);
    for (const m of ELITE_MODS) {
      expect(m.hpMult).toBeGreaterThanOrEqual(1);
      expect(m.dmgMult).toBeGreaterThanOrEqual(1);
      expect(typeof m.tint).toBe('number');
    }
  });
});
