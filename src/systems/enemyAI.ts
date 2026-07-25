// Pure enemy-movement decisions (m2.4). Kept out of Enemy.ts so the "how does
// this enemy want to move" logic is unit-testable without Phaser. Enemy.ts owns
// the stateful behaviors (timers, telegraphs, firing); this only decides the
// direction/intent for a given frame.

export type MoveMode = 'chase' | 'kite' | 'hold';

/**
 * How an enemy should move this frame given its distance to the player:
 *  - `hold`  out of aggro, or basically on top of the player.
 *  - `kite`  a `keepDistance` enemy that's too close — back away.
 *  - `hold`  a `keepDistance` enemy that's in its comfort band.
 *  - `chase` otherwise — close the gap.
 * The band around `keepDistance` (±20%) stops kiters from jittering in place.
 */
export function moveMode(dist: number, aggro: number, keepDistance?: number): MoveMode {
  if (dist > aggro || dist <= 2) return 'hold';
  if (keepDistance !== undefined) {
    if (dist < keepDistance * 0.8) return 'kite';
    if (dist <= keepDistance * 1.2) return 'hold';
  }
  return 'chase';
}

/** True when a timed ability whose distance gate is `range` may fire now. */
export const abilityReady = (dist: number, range: number, cooldown: number): boolean =>
  dist <= range && cooldown <= 0;
