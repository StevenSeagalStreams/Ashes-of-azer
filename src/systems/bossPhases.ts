// Boss phase engine (Milestone 4.x). A boss with a `phases` list fights
// differently as its HP falls: each phase crosses at an HP fraction and layers a
// new move-set (and optional recolor / speed / damage / on-enter nova) onto the
// boss — a genuinely different fight, not just more HP. Pure + testable; the
// Enemy applies the selected phase and the scene shows the entry telegraph.
import type { BossPhase, EnemyData } from '../data/schemas/index.ts';

// The pattern fields a phase may overlay onto the boss's active def. spd/dmg are
// handled as multipliers by the Enemy, and tint/name/nova are presentation, so
// they are deliberately not in this list.
const OVERLAY_KEYS = ['slam', 'charge', 'ranged', 'explode', 'summon', 'poison', 'aggro', 'keepDistance'] as const;

/** Orders phases so the first one crossed comes first (descending hpPct). */
export function sortPhases(phases: readonly BossPhase[]): BossPhase[] {
  return [...phases].sort((a, b) => b.hpPct - a.hpPct);
}

/**
 * Given sorted phases, how many have already been entered, and the current HP
 * fraction, returns the new entered-count. A single big hit that crosses several
 * thresholds advances straight to the deepest phase (no skipped transitions on
 * the next tick). Never decreases — bosses don't heal back into earlier phases.
 */
export function advancePhase(phases: readonly BossPhase[], hpFraction: number, entered: number): number {
  let n = Math.max(0, entered);
  while (n < phases.length && hpFraction <= phases[n]!.hpPct) n++;
  return n;
}

/** Layers a phase's pattern overrides onto a def, returning a new def. */
export function mergePhaseDef(base: EnemyData, phase: BossPhase): EnemyData {
  const out: EnemyData = { ...base };
  const p = phase as Record<string, unknown>;
  for (const k of OVERLAY_KEYS) {
    if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];
  }
  return out;
}
