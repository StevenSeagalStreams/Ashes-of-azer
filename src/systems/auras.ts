// Pack-leader auras (Milestone 4, Desert Empire signature system). Desert enemies
// roam in packs led by a leader whose aura buffs nearby packmates — so a pack
// fights as a unit and you break it by killing the leader (its aura vanishes,
// the packmates soften). Pure + testable; the scene samples leaders each frame
// and applies the result to each allied enemy.

export interface AuraSource {
  x: number;
  y: number;
  radius: number;
  dmgMult: number; // >= 1
  spdMult: number; // >= 1
}

export interface AuraBuff {
  dmgMult: number;
  spdMult: number;
}

const NONE: AuraBuff = { dmgMult: 1, spdMult: 1 };

/**
 * The combined buff for an ally at (x, y) from all `sources` whose radius covers
 * it. Overlapping auras stack multiplicatively (two leaders buff harder than
 * one). Returns {1,1} when no aura reaches the point. Never mutates its input.
 */
export function packAuraAt(sources: readonly AuraSource[], x: number, y: number): AuraBuff {
  if (sources.length === 0) return NONE;
  let dmg = 1;
  let spd = 1;
  let hit = false;
  for (const s of sources) {
    if (Math.hypot(x - s.x, y - s.y) > s.radius) continue;
    dmg *= s.dmgMult;
    spd *= s.spdMult;
    hit = true;
  }
  return hit ? { dmgMult: dmg, spdMult: spd } : NONE;
}
