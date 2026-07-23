import { describe, expect, it } from 'vitest';
import {
  AffixesFileSchema,
  DialogueFileSchema,
  EnemiesFileSchema,
  ItemsFileSchema,
  QuestsFileSchema,
  SkillsFileSchema,
  ZonesFileSchema,
} from './index.ts';

describe('EnemiesFileSchema', () => {
  it('accepts a valid enemy roster', () => {
    const roster = [
      { id: 'slime', sprite: 'slime', hp: 22, dmg: 6, spd: 26, xp: 8, aggro: 90, width: 10, height: 6 },
      {
        id: 'boss',
        sprite: 'boss',
        hp: 420,
        dmg: 16,
        spd: 30,
        xp: 150,
        aggro: 999,
        width: 16,
        height: 12,
        boss: true,
        name: 'ROTFANG, BARROW TYRANT',
      },
    ];
    expect(EnemiesFileSchema.safeParse(roster).success).toBe(true);
  });

  it('rejects an enemy missing required fields', () => {
    const bad = [{ id: 'ghost', sprite: 'ghost', hp: 10 }];
    expect(EnemiesFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative hp', () => {
    const bad = [
      { id: 'slime', sprite: 'slime', hp: -1, dmg: 6, spd: 26, xp: 8, aggro: 90, width: 10, height: 6 },
    ];
    expect(EnemiesFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('AffixesFileSchema', () => {
  it('accepts a valid affix pool', () => {
    const affixes = [
      { key: 'dmg', labelTemplate: '+{v} Damage', min: 2, max: 8 },
      { key: 'poison', labelTemplate: 'Critical Hits poison enemies', min: 1, max: 1, flag: true },
    ];
    expect(AffixesFileSchema.safeParse(affixes).success).toBe(true);
  });

  it('rejects an affix without a label template', () => {
    expect(AffixesFileSchema.safeParse([{ key: 'dmg', min: 2, max: 8 }]).success).toBe(false);
  });
});

describe('ItemsFileSchema', () => {
  it('accepts the prototype-shaped item content', () => {
    const items = {
      slots: ['Weapon', 'Helmet', 'Chest', 'Boots', 'Ring'],
      bases: {
        Weapon: [{ name: 'Rusty Sword', base: 3 }],
        Helmet: [{ name: 'Leather Cap', base: 2 }],
        Chest: [{ name: 'Padded Vest', base: 3 }],
        Boots: [{ name: 'Worn Boots', base: 2 }],
        Ring: [{ name: 'Copper Ring', base: 1 }],
      },
      rarities: [{ id: 'white', dropChance: 0.42, affixCount: 0 }],
      legendaries: [
        {
          name: 'Frostheart',
          slot: 'Ring',
          power: 'frostheart',
          text: 'Frozen enemies explode for 40 damage.',
          forcedAffixes: [{ key: 'frost', value: 30 }],
        },
      ],
    };
    expect(ItemsFileSchema.safeParse(items).success).toBe(true);
  });

  it('rejects an unknown item slot', () => {
    const items = {
      slots: ['Weapon'],
      bases: { Weapon: [{ name: 'Sword', base: 3 }] },
      rarities: [],
      legendaries: [{ name: 'X', slot: 'Belt', power: 'x', text: 'x', forcedAffixes: [] }],
    };
    expect(ItemsFileSchema.safeParse(items).success).toBe(false);
  });

  it('rejects a drop chance outside 0-1', () => {
    const items = {
      slots: [],
      bases: {},
      rarities: [{ id: 'white', dropChance: 1.5, affixCount: 0 }],
      legendaries: [],
    };
    expect(ItemsFileSchema.safeParse(items).success).toBe(false);
  });
});

describe('SkillsFileSchema', () => {
  it('accepts each of the prototype skill mechanics', () => {
    const skills = [
      {
        id: 'shield_slam',
        mechanic: 'shockwave',
        key: '1',
        icon: '🛡',
        name: 'Shield Slam',
        unlockLevel: 1,
        maxRank: 5,
        cooldown: 5,
        manaCost: 18,
        radius: { base: 40, perRank: 3 },
        damageMultiplier: { base: 1, perRank: 0.3 },
        stunDuration: { base: 0.9, perRank: 0.3 },
      },
      {
        id: 'leap',
        mechanic: 'leap',
        key: '3',
        icon: '💨',
        name: 'Leap',
        unlockLevel: 1,
        maxRank: 5,
        cooldown: 6,
        manaCost: 14,
        distance: { base: 95, perRank: 15 },
        damageMultiplier: { base: 0.7, perRank: 0.2 },
        landingRadius: 36,
        stunDuration: 0.5,
      },
      {
        id: 'execute',
        mechanic: 'execute',
        key: '4',
        icon: '⚔',
        name: 'Execute',
        unlockLevel: 3,
        maxRank: 5,
        cooldown: 7,
        manaCost: 20,
        range: 42,
        damageMultiplierLow: { base: 4, perRank: 0.6 },
        damageMultiplierHigh: 1.5,
        lifeThresholdPct: { base: 22, perRank: 3 },
      },
      {
        id: 'war_cry',
        mechanic: 'buff',
        key: '5',
        icon: '🔥',
        name: 'War Cry',
        unlockLevel: 5,
        maxRank: 5,
        cooldown: 15,
        manaCost: 25,
        damageBonusPct: { base: 25, perRank: 10 },
        duration: 6,
      },
    ];
    expect(SkillsFileSchema.safeParse(skills).success).toBe(true);
  });

  it('rejects a shockwave skill with a leap-only field', () => {
    const bad = [
      {
        id: 'broken',
        mechanic: 'shockwave',
        key: '1',
        icon: '🛡',
        name: 'Broken',
        unlockLevel: 1,
        maxRank: 5,
        cooldown: 5,
        manaCost: 18,
        distance: { base: 95, perRank: 15 }, // not a shockwave field
      },
    ];
    expect(SkillsFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown mechanic', () => {
    const bad = [
      {
        id: 'x',
        mechanic: 'teleport',
        key: '6',
        icon: '?',
        name: 'X',
        unlockLevel: 1,
        maxRank: 1,
        cooldown: 1,
        manaCost: 1,
      },
    ];
    expect(SkillsFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ZonesFileSchema', () => {
  it('accepts the prototype zones', () => {
    const zones = [
      { id: 'overworld', name: 'Starter Plains', dark: false, enemyTypes: ['slime', 'bat'] },
      { id: 'dungeon', name: 'Hollow Barrow', dark: true, enemyTypes: ['skel', 'bat', 'boss'] },
    ];
    expect(ZonesFileSchema.safeParse(zones).success).toBe(true);
  });

  it('rejects a zone missing dark', () => {
    expect(ZonesFileSchema.safeParse([{ id: 'x', name: 'X', enemyTypes: [] }]).success).toBe(false);
  });
});

describe('QuestsFileSchema', () => {
  it('accepts an empty roster (no quest content ported yet)', () => {
    expect(QuestsFileSchema.safeParse([]).success).toBe(true);
  });

  it('accepts a well-formed quest and fills in defaults', () => {
    const parsed = QuestsFileSchema.safeParse([
      {
        id: 'q1',
        name: 'First Blood',
        objectives: [{ type: 'kill', target: 'slime', count: 5 }],
        rewards: { xp: 100 },
      },
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[0]?.rewards.gold).toBe(0);
      expect(parsed.data[0]?.prerequisites).toEqual([]);
    }
  });

  it('rejects a quest with zero objectives', () => {
    const bad = [{ id: 'q1', name: 'Empty', objectives: [], rewards: {} }];
    expect(QuestsFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('DialogueFileSchema', () => {
  it('accepts an empty roster (no dialogue content ported yet)', () => {
    expect(DialogueFileSchema.safeParse([]).success).toBe(true);
  });

  it('accepts a well-formed dialogue tree', () => {
    const tree = [
      {
        id: 'npc_elder',
        startNodeId: 'greet',
        nodes: [{ id: 'greet', text: 'Welcome, traveler.', choices: [] }],
      },
    ];
    expect(DialogueFileSchema.safeParse(tree).success).toBe(true);
  });

  it('rejects a tree with no nodes', () => {
    const bad = [{ id: 'npc_elder', startNodeId: 'greet', nodes: [] }];
    expect(DialogueFileSchema.safeParse(bad).success).toBe(false);
  });
});
