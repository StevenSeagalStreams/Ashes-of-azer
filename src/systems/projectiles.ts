// Pure geometry for the projectile system (Milestone 1.3). The Phaser
// Projectile entity + pool live in src/entities/Projectile.ts; this module
// holds the unit-testable math: split fans and chain retargeting.

export interface Point {
  x: number;
  y: number;
}

/**
 * Angles (radians) for a fan of `count` projectiles centred on `baseAngle`,
 * evenly spread across `spread` radians. count 1 → just the base angle.
 */
export function fanAngles(baseAngle: number, count: number, spread: number): number[] {
  if (count <= 1) return [baseAngle];
  const out: number[] = [];
  const step = spread / (count - 1);
  const start = baseAngle - spread / 2;
  for (let i = 0; i < count; i++) out.push(start + step * i);
  return out;
}

/**
 * Nearest target to `from` among `candidates`, skipping ids in `exclude` and
 * anything beyond `maxRange`. Returns null when nothing qualifies. Used for
 * chain-lightning-style jumps so a bolt never hits the same enemy twice.
 */
export function nearestTarget<T extends Point & { id: number }>(
  from: Point,
  candidates: readonly T[],
  exclude: ReadonlySet<number>,
  maxRange: number,
): T | null {
  let best: T | null = null;
  let bestD = maxRange;
  for (const c of candidates) {
    if (exclude.has(c.id)) continue;
    const d = Math.hypot(c.x - from.x, c.y - from.y);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
