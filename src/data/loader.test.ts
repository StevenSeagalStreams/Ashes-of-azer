import { describe, expect, it } from 'vitest';
import { DataValidationError, validateGameData } from './loader.ts';

const validRaw = {
  enemies: [{ id: 'slime', sprite: 'slime', hp: 22, dmg: 6, spd: 26, xp: 8, aggro: 90, width: 10, height: 6 }],
  affixes: [{ key: 'dmg', labelTemplate: '+{v} Damage', min: 2, max: 8 }],
  items: {
    slots: ['Weapon'],
    bases: { Weapon: [{ name: 'Rusty Sword', base: 3 }] },
    rarities: [{ id: 'white', dropChance: 1, affixCount: 0 }],
    legendaries: [],
  },
  skills: [],
  zones: [{ id: 'overworld', name: 'Starter Plains', dark: false, enemyTypes: ['slime'] }],
  quests: [],
  dialogue: [],
  npcs: [],
};

describe('validateGameData', () => {
  it('accepts well-formed content across every file', () => {
    const data = validateGameData(validRaw);
    expect(data.enemies).toHaveLength(1);
    expect(data.enemies[0]?.id).toBe('slime');
    expect(data.zones[0]?.name).toBe('Starter Plains');
  });

  it('fails loudly (throws) rather than silently dropping bad content', () => {
    const bad = { ...validRaw, enemies: [{ id: 'ghost' }] };
    expect(() => validateGameData(bad)).toThrow(DataValidationError);
  });

  it('reports every invalid file, not just the first', () => {
    const bad = {
      ...validRaw,
      enemies: [{ id: 'ghost' }], // missing required fields
      affixes: [{ key: 'dmg' }], // missing labelTemplate/min/max
    };
    try {
      validateGameData(bad);
      expect.unreachable('expected validateGameData to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataValidationError);
      const issues = (err as DataValidationError).issues;
      expect(issues.some((i) => i.startsWith('enemies.json'))).toBe(true);
      expect(issues.some((i) => i.startsWith('affixes.json'))).toBe(true);
    }
  });

  it('rejects a completely malformed payload (wrong shape) without crashing the process', () => {
    const bad = { ...validRaw, items: 'not an object' };
    expect(() => validateGameData(bad)).toThrow(DataValidationError);
  });
});

describe('the real /data/*.json content', () => {
  it('loads and validates without any code changes needed', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    expect(data.enemies.length).toBeGreaterThanOrEqual(4); // slime, bat, skel, boss
    expect(data.items.legendaries.length).toBeGreaterThanOrEqual(3);
    expect(data.skills.length).toBeGreaterThanOrEqual(5);
    expect(data.zones.map((z) => z.id)).toEqual(['overworld', 'dungeon', 'town']);
  });
});
