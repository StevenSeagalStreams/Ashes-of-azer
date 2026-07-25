// Pure reputation logic (m2.4). Kept out of the scene so tier math + rep updates
// are unit-testable. The scene owns the side effects (toasts, vendor stock).

import type { FactionData, FactionTier } from '../data/schemas/index.ts';

export type Reputation = Record<string, number>; // faction id → rep points

/** The highest tier whose threshold the rep has reached (tiers authored low→high). */
export function repTier(faction: FactionData, rep: number): FactionTier {
  let best = faction.tiers[0]!;
  for (const t of faction.tiers) if (rep >= t.threshold && t.threshold >= best.threshold) best = t;
  return best;
}

/** The faction (if any) whose zones include `zoneId`. */
export const factionForZone = (factions: readonly FactionData[], zoneId: string): FactionData | undefined =>
  factions.find((f) => f.zones.includes(zoneId));

/** Returns new reputation with `amount` added to `factionId` (never mutates). */
export const addRep = (reputation: Reputation, factionId: string, amount: number): Reputation => ({
  ...reputation,
  [factionId]: (reputation[factionId] ?? 0) + amount,
});

/** Rep toward the next tier: current tier, next tier (or null at max), and progress. */
export function repProgress(
  faction: FactionData,
  rep: number,
): { tier: FactionTier; next: FactionTier | null; toNext: number } {
  const tier = repTier(faction, rep);
  const above = faction.tiers.filter((t) => t.threshold > tier.threshold).sort((a, b) => a.threshold - b.threshold);
  const next = above[0] ?? null;
  return { tier, next, toNext: next ? next.threshold - rep : 0 };
}
