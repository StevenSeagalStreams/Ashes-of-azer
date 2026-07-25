import { describe, expect, it } from 'vitest';
import { addRep, factionForZone, repProgress, repTier } from './factions.ts';
import type { FactionData } from '../data/schemas/index.ts';

const wardens: FactionData = {
  id: 'wardens',
  name: 'Wardens of the Reach',
  zones: ['forest', 'forestdungeon'],
  killRep: 2,
  bossRep: 50,
  tiers: [
    { name: 'Outsider', threshold: 0, vendorBonus: 0 },
    { name: 'Recruit', threshold: 120, vendorBonus: 2 },
    { name: 'Warden', threshold: 360, vendorBonus: 4 },
  ],
};

describe('repTier', () => {
  it('returns the highest tier reached', () => {
    expect(repTier(wardens, 0).name).toBe('Outsider');
    expect(repTier(wardens, 119).name).toBe('Outsider');
    expect(repTier(wardens, 120).name).toBe('Recruit');
    expect(repTier(wardens, 500).name).toBe('Warden');
  });
});

describe('factionForZone', () => {
  it('finds the faction whose zones include the id, else undefined', () => {
    expect(factionForZone([wardens], 'forest')?.id).toBe('wardens');
    expect(factionForZone([wardens], 'forestdungeon')?.id).toBe('wardens');
    expect(factionForZone([wardens], 'town')).toBeUndefined();
  });
});

describe('addRep', () => {
  it('adds without mutating and starts absent factions at zero', () => {
    const rep = { wardens: 10 };
    expect(addRep(rep, 'wardens', 5)).toEqual({ wardens: 15 });
    expect(addRep(rep, 'druids', 3)).toEqual({ wardens: 10, druids: 3 });
    expect(rep).toEqual({ wardens: 10 }); // untouched
  });
});

describe('repProgress', () => {
  it('reports the current tier, the next, and rep remaining to it', () => {
    const p = repProgress(wardens, 200);
    expect(p.tier.name).toBe('Recruit');
    expect(p.next?.name).toBe('Warden');
    expect(p.toNext).toBe(160); // 360 - 200
  });

  it('has no next tier at the top', () => {
    const p = repProgress(wardens, 900);
    expect(p.tier.name).toBe('Warden');
    expect(p.next).toBeNull();
    expect(p.toNext).toBe(0);
  });
});
