// Poison / damage-over-time status (Milestone 4, Zone 3 — the Haunted Marsh's
// core mechanic). A single refreshable DoT channel on a target: the strongest
// active poison wins (dps + duration refresh to the max, they don't stack
// unboundedly), and damage lands on a fixed 0.5s tick — matching the feel of the
// enemy-side bleed/burn DoT. Pure and entity-agnostic so it can drive the player
// now and any target later; the caller owns applying `damage` to hp.

export interface Poison {
  dps: number; // damage per second while active
  remaining: number; // seconds of poison left
  tick: number; // seconds until the next damage tick
}

export const NO_POISON: Poison = { dps: 0, remaining: 0, tick: 0 };
export const POISON_TICK = 0.5; // seconds between damage ticks

/** Applies/refreshes a poison, keeping the stronger dps and the longer duration
 *  (refresh-not-stack, as the enemy DoT does). Non-positive inputs are ignored. */
export function applyPoison(current: Poison, dps: number, duration: number): Poison {
  if (dps <= 0 || duration <= 0) return current;
  const fresh = current.remaining <= 0;
  return {
    dps: Math.max(current.dps, dps),
    remaining: Math.max(current.remaining, duration),
    tick: fresh ? POISON_TICK : current.tick,
  };
}

export interface PoisonStep {
  poison: Poison;
  damage: number; // damage that landed this step (0 unless a tick elapsed)
}

/**
 * Advances a poison by `dt` seconds. Returns the new state and the damage that
 * landed this step — nonzero only when a 0.5s tick elapses, at which point it
 * deals `dps * 0.5` (rounded, min 1). Expires to NO_POISON once its time runs
 * out. Pure: the caller subtracts `damage` from the target's hp.
 */
export function tickPoison(current: Poison, dt: number): PoisonStep {
  if (current.remaining <= 0) return { poison: NO_POISON, damage: 0 };
  const remaining = current.remaining - dt;
  let tick = current.tick - dt;
  let damage = 0;
  if (tick <= 0) {
    tick = POISON_TICK;
    damage = Math.max(1, Math.round(current.dps * POISON_TICK));
  }
  if (remaining <= 0) return { poison: NO_POISON, damage };
  return { poison: { dps: current.dps, remaining, tick }, damage };
}
