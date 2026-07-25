// Ground-hazard geometry (Milestone 4.x, world-boss movement mechanic). A world
// boss seeds lingering damage pools around the player; standing still means
// standing in them, so the fight is about repositioning, not just DPS. Pure +
// testable; the HazardField pool renders/ticks them and the Enemy triggers them.

export type Rng = () => number;

export interface HazardSpot {
  x: number;
  y: number;
}

/**
 * Scatters `count` hazard centres around (cx, cy). The first spot is the centre
 * itself (a pool dropped right on the player's feet); any extras ring outward
 * within `spread` px at a random angle/distance. Deterministic given `rng`.
 */
export function hazardSpots(cx: number, cy: number, count: number, spread: number, rng: Rng): HazardSpot[] {
  const n = Math.max(1, Math.floor(count));
  const spots: HazardSpot[] = [{ x: cx, y: cy }];
  for (let i = 1; i < n; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = spread * (0.4 + 0.6 * rng()); // never dead-centre on an extra
    spots.push({ x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist });
  }
  return spots;
}

/** True if (px, py) lies within `radius` of a hazard centred at (hx, hy). */
export function inHazard(px: number, py: number, hx: number, hy: number, radius: number): boolean {
  return Math.hypot(px - hx, py - hy) <= radius;
}
