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
  recipes: { materials: [], recipes: [] },
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
    expect(data.zones.map((z) => z.id)).toEqual(['overworld', 'dungeon', 'town', 'forest']);
  });

  // Cross-references are plain string ids; zod checks their shape, not that they
  // resolve. This guards the quest/dialogue/NPC content graph against typos and
  // dangling links (e.g. a prerequisite or startsQuest naming a quest that was
  // renamed or never existed) — the failure mode content authors hit most.
  it('has a consistent quest / dialogue / NPC graph', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const questIds = new Set(data.quests.map((q) => q.id));
    const enemyIds = new Set(data.enemies.map((e) => e.id));
    const zoneIds = new Set(data.zones.map((z) => z.id));
    const treeIds = new Set(data.dialogue.map((t) => t.id));

    for (const z of data.zones)
      for (const et of z.enemyTypes) expect(enemyIds, `${z.id} enemyType`).toContain(et);

    for (const q of data.quests) {
      for (const pre of q.prerequisites) expect(questIds, `${q.id} prereq`).toContain(pre);
      for (const obj of q.objectives) {
        if (obj.type === 'kill') expect(enemyIds, `${q.id} kill target`).toContain(obj.target);
        if (obj.type === 'reach') expect(zoneIds, `${q.id} reach target`).toContain(obj.target);
      }
    }

    for (const npc of data.npcs) {
      expect(treeIds, `${npc.id} dialogue`).toContain(npc.dialogue);
      for (const qid of npc.offersQuests) expect(questIds, `${npc.id} offersQuests`).toContain(qid);
    }

    for (const tree of data.dialogue) {
      const nodeIds = new Set(tree.nodes.map((n) => n.id));
      expect(nodeIds, `${tree.id} startNode`).toContain(tree.startNodeId);
      for (const node of tree.nodes) {
        for (const c of node.choices) {
          if (c.nextNodeId) expect(nodeIds, `${tree.id}.${node.id} nextNodeId`).toContain(c.nextNodeId);
          if (c.action?.startsQuest) expect(questIds, `${tree.id} startsQuest`).toContain(c.action.startsQuest);
          for (const key of ['questActive', 'questCompleted', 'questAvailable'] as const) {
            const ref = c.condition?.[key];
            if (ref) expect(questIds, `${tree.id} ${key}`).toContain(ref);
          }
        }
      }
    }
  });

  it('the Ashfall town chain links each quest to the next (5 quests, 5 NPCs)', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const chain = data.quests.filter((q) => q.chain === 'ashfall');
    expect(chain.length).toBe(5);
    // Every ashfall quest but the first is gated behind another ashfall quest,
    // and each is NPC-given (started from dialogue, not auto-offered).
    const chainIds = new Set(chain.map((q) => q.id));
    const gated = chain.filter((q) => q.prerequisites.some((p) => chainIds.has(p)));
    expect(gated.length).toBe(chain.length - 1);
    for (const q of chain) expect(q.autoOffer).toBe(false);
    // Each chain quest is offered by exactly one NPC.
    for (const q of chain) {
      const givers = data.npcs.filter((n) => n.offersQuests.includes(q.id));
      expect(givers.length, `${q.id} givers`).toBe(1);
    }
  });
});
