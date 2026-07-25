import { z } from 'zod';

// Factions & reputation (m2.4). A faction covers one or more zones: kills there
// grant its rep, and its tiers unlock vendor stock. Fully data-driven — adding a
// faction (or retuning tiers) is a JSON edit in data/factions.json.
export const FactionTierSchema = z.object({
  name: z.string(), // shown to the player ("Recruit", "Warden"…)
  threshold: z.number().int().nonnegative(), // rep required to reach this tier
  vendorBonus: z.number().int().nonnegative().default(0), // extra vendor stock slots at this tier
});
export type FactionTier = z.infer<typeof FactionTierSchema>;

export const FactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  zones: z.array(z.string()), // zone ids whose kills grant this faction's rep
  killRep: z.number().nonnegative().default(1), // rep per normal kill in those zones
  bossRep: z.number().nonnegative().default(0), // rep per boss kill (boss:true)
  // Tiers, authored low→high; the first should be threshold 0 (the base tier).
  tiers: z.array(FactionTierSchema).min(1),
});
export type FactionData = z.infer<typeof FactionSchema>;

export const FactionsFileSchema = z.array(FactionSchema);
export type FactionsFile = z.infer<typeof FactionsFileSchema>;
