import { describe, expect, it } from 'vitest';
import type { GameData } from '../data/loader.ts';
import { zoneEnemyDefs } from './zoneSpawns.ts';

const slime = { id: 'slime', sprite: 'slime', hp: 22, dmg: 6, spd: 26, xp: 8, aggro: 90, width: 10, height: 6 };
const bat = { id: 'bat', sprite: 'bat', hp: 16, dmg: 5, spd: 52, xp: 10, aggro: 120, width: 10, height: 5 };

const baseData: GameData = {
  enemies: [slime, bat],
  affixes: [],
  items: { slots: [], bases: {}, rarities: [], legendaries: [] },
  skills: [],
  zones: [{ id: 'overworld', name: 'Starter Plains', dark: false, enemyTypes: ['slime', 'bat'] }],
  quests: [],
  dialogue: [],
  npcs: [],
  recipes: { materials: [], recipes: [] },
};

describe('zoneEnemyDefs', () => {
  it('resolves a zone’s enemyTypes into full enemy defs', () => {
    expect(zoneEnemyDefs(baseData, 'overworld')).toEqual([slime, bat]);
  });

  it('picks up a brand new enemy the moment it is added to both JSON files — no code change', () => {
    // This is the "zero code changes" proof as a permanent regression test:
    // this function names no enemy id anywhere in its own source.
    const wisp = { id: 'wisp', sprite: 'wisp', hp: 500, dmg: 1, spd: 200, xp: 999, aggro: 300, width: 6, height: 6 };
    const data: GameData = {
      ...baseData,
      enemies: [...baseData.enemies, wisp],
      zones: [{ ...baseData.zones[0]!, enemyTypes: ['slime', 'bat', 'wisp'] }],
    };
    expect(zoneEnemyDefs(data, 'overworld')).toEqual([slime, bat, wisp]);
  });

  it('throws (fails loudly) for an unknown zone id', () => {
    expect(() => zoneEnemyDefs(baseData, 'nonexistent')).toThrow(/zone "nonexistent" not found/);
  });

  it('throws (fails loudly) when a zone references a missing enemy id', () => {
    const data: GameData = {
      ...baseData,
      zones: [{ ...baseData.zones[0]!, enemyTypes: ['slime', 'ghost'] }],
    };
    expect(() => zoneEnemyDefs(data, 'overworld')).toThrow(/unknown enemy id "ghost"/);
  });
});
