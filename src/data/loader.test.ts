/// <reference types="vite/client" />
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
  factions: [],
  endings: { requiredRelics: [], paths: [] },
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
    expect(data.zones.map((z) => z.id)).toEqual(['overworld', 'dungeon', 'town', 'forest', 'foresttown', 'forestdungeon']);
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
    const endingIds = new Set(data.endings.paths.map((p) => p.id));

    for (const z of data.zones)
      for (const et of z.enemyTypes) expect(enemyIds, `${z.id} enemyType`).toContain(et);

    // A summoner's minion must be a real enemy id (base + corrupt-variant summons).
    for (const e of data.enemies) {
      if (e.summon) expect(enemyIds, `${e.id} summon minion`).toContain(e.summon.minion);
      if (e.corrupt?.summon) expect(enemyIds, `${e.id} corrupt summon minion`).toContain(e.corrupt.summon.minion);
    }

    // Any relic-granting enemy carries a display name for its pickup toast.
    for (const e of data.enemies) if (e.relic) expect(e.relicName, `${e.id} relicName`).toBeTruthy();

    // Faction zones + a vendor's faction + a quest's rep-reward faction all resolve.
    const factionIds = new Set(data.factions.map((f) => f.id));
    for (const f of data.factions)
      for (const z of f.zones) expect(zoneIds, `${f.id} zone`).toContain(z);
    for (const npc of data.npcs) if (npc.faction) expect(factionIds, `${npc.id} faction`).toContain(npc.faction);
    for (const q of data.quests) if (q.rewards.faction) expect(factionIds, `${q.id} reward faction`).toContain(q.rewards.faction);

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
          if (c.action?.ending) expect(endingIds, `${tree.id} ending`).toContain(c.action.ending);
          for (const key of ['questActive', 'questCompleted', 'questAvailable'] as const) {
            const ref = c.condition?.[key];
            if (ref) expect(questIds, `${tree.id} ${key}`).toContain(ref);
          }
        }
      }
    }
  });

  it('the Warden trials form an 8–12 quest chain that builds Warden rep', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const chain = data.quests.filter((q) => q.chain === 'warden_trials');
    expect(chain.length).toBeGreaterThanOrEqual(8);
    expect(chain.length).toBeLessThanOrEqual(12);
    // Every trial but the first is gated behind another, and each awards Warden rep.
    const ids = new Set(chain.map((q) => q.id));
    const gated = chain.filter((q) => q.prerequisites.some((p) => ids.has(p)));
    expect(gated.length).toBe(chain.length - 1);
    for (const q of chain) {
      expect(q.autoOffer).toBe(false);
      expect(q.rewards.faction).toBe('wardens');
      expect(q.rewards.rep).toBeGreaterThan(0);
      expect(data.npcs.filter((n) => n.offersQuests.includes(q.id)).length, `${q.id} givers`).toBe(1);
    }
  });

  it('per-tier corruption dialogue shows exactly one reaction per band', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const { visibleChoices } = await import('../systems/dialogue.ts');
    const data = loadGameData();
    const elder = data.dialogue.find((t) => t.id === 'elder')!;
    const greet = elder.nodes.find((n) => n.id === 'greet')!;
    const ctxAt = (corruption: number) => ({
      flags: {},
      quests: { active: [], completed: [], progress: {}, tracked: null },
      catalog: data.quests,
      corruption,
    });
    const changed = (c: number) => visibleChoices(greet, ctxAt(c)).filter((ch) => /seem changed/i.test(ch.text));
    expect(changed(0)).toHaveLength(0); // Pure — no reaction
    expect(changed(30)).toHaveLength(1); // Tainted band
    expect(changed(60)).toHaveLength(1); // Corrupt band
    expect(changed(90)).toHaveLength(1); // Defiled band
    // Each band routes to a distinct, existing node.
    const targets = [30, 60, 90].map((c) => changed(c)[0]!.nextNodeId);
    expect(new Set(targets).size).toBe(3);
    const nodeIds = new Set(elder.nodes.map((n) => n.id));
    for (const t of targets) expect(nodeIds).toContain(t);
  });

  it('the Bramblewarren mini-boss grants a relic fragment', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const mossmaw = data.enemies.find((e) => e.id === 'mossmaw');
    expect(mossmaw?.boss).toBe(true);
    expect(mossmaw?.relic).toBeTruthy();
    // The dungeon's enemyTypes include the mini-boss so the zone knows it.
    expect(data.zones.find((z) => z.id === 'forestdungeon')?.enemyTypes).toContain('mossmaw');
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

  it('Thornhollow (foresttown) offers the full slate of services', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const npcs = data.npcs.filter((n) => n.zone === 'foresttown');
    const services = new Set(npcs.map((n) => n.service).filter(Boolean));
    expect(services).toEqual(new Set(['vendor', 'blacksmith', 'stash']));
    // The trainer is a dialogue NPC (respec), not a service UI — its tree has a respec choice.
    const trainer = data.dialogue.find((t) => t.id === 'foresttrainer');
    expect(trainer, 'foresttrainer dialogue tree').toBeTruthy();
    const hasRespec = trainer!.nodes.some((n) => n.choices.some((c) => c.action?.respec === true));
    expect(hasRespec).toBe(true);
  });

  it('the Shrine of Ashes offers all three endings, each gated on all relics', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const { visibleChoices } = await import('../systems/dialogue.ts');
    const data = loadGameData();
    // The three ending paths are the canonical Destroy / Control / Become.
    expect(data.endings.paths.map((p) => p.id)).toEqual(['destroy', 'control', 'become']);
    for (const p of data.endings.paths) {
      expect(p.title, `${p.id} title`).toBeTruthy();
      expect(p.text.length, `${p.id} text`).toBeGreaterThan(40);
    }
    // requiredRelics must all be real relic ids granted somewhere in the content:
    // either by an enemy (enemies.json) or by a map secret (Tiled objects). This
    // guards the finale gate against a typo'd or unobtainable relic.
    const grantedRelics = new Set<string>();
    for (const e of data.enemies) if (e.relic) grantedRelics.add(e.relic);
    // Vite statically replaces import.meta.glob at transform time (Vitest supports it).
    const maps = import.meta.glob('../../assets/maps/*.json', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    for (const raw of Object.values(maps))
      for (const m of raw.matchAll(/relic_[a-z_]+/g)) grantedRelics.add(m[0]);
    expect(data.endings.requiredRelics.length).toBeGreaterThan(0);
    for (const r of data.endings.requiredRelics) expect(grantedRelics, `relic ${r} is grantable`).toContain(r);

    // The shrine NPC lives in the Ashfall hub and talks to the shrine tree.
    const shrineNpc = data.npcs.find((n) => n.id === 'shrine');
    expect(shrineNpc?.zone).toBe('town');
    expect(shrineNpc?.dialogue).toBe('shrine');
    expect(shrineNpc?.prop ?? false).toBe(false); // must be interactive

    const shrine = data.dialogue.find((t) => t.id === 'shrine')!;
    const root = shrine.nodes.find((n) => n.id === shrine.startNodeId)!;
    const ctx = (allRelics: boolean) => ({
      flags: (allRelics ? { all_relics: true } : {}) as Record<string, boolean>,
      quests: { active: [], completed: [], progress: {}, tracked: null },
      catalog: data.quests,
      corruption: 0,
    });
    // Before the relics are gathered, none of the ending routes are offered.
    expect(visibleChoices(root, ctx(false)).some((c) => c.nextNodeId?.startsWith('ask_'))).toBe(false);
    // Once gathered, all three confirm-routes appear and each seals a distinct ending.
    const openRoutes = visibleChoices(root, ctx(true))
      .map((c) => c.nextNodeId)
      .filter((id): id is string => !!id && id.startsWith('ask_'));
    expect(openRoutes.length).toBe(3);
    const sealed = new Set<string>();
    for (const routeId of openRoutes) {
      const node = shrine.nodes.find((n) => n.id === routeId)!;
      const seal = node.choices.find((c) => c.action?.ending)!;
      expect(data.endings.paths.map((p) => p.id), `${routeId} seals a real ending`).toContain(seal.action!.ending);
      sealed.add(seal.action!.ending!);
    }
    expect(sealed).toEqual(new Set(['destroy', 'control', 'become']));
  });
});
