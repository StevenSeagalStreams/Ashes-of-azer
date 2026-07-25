/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { DataValidationError, validateGameData } from './loader.ts';

const validRaw = {
  enemies: [{ id: 'slime', sprite: 'slime', hp: 22, dmg: 6, spd: 26, xp: 8, aggro: 90, width: 10, height: 6 }],
  affixes: [{ key: 'dmg', labelTemplate: '+{v} Damage', tiers: [{ ilvl: 1, min: 2, max: 8, weight: 100 }] }],
  items: {
    slots: ['Weapon'],
    bases: { Weapon: [{ name: 'Rusty Sword', base: 3 }] },
    rarities: [{ id: 'white', dropChance: 1, affixMin: 0, affixMax: 0 }],
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
      affixes: [{ key: 'dmg' }], // missing labelTemplate/tiers
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
    expect(data.zones.map((z) => z.id)).toEqual(['overworld', 'dungeon', 'town', 'forest', 'foresttown', 'forestdungeon', 'marsh', 'marshtown', 'marshdungeon']);
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

  it('the Sunken Barrow mini-boss (Gravemarrow) grants a relic and multi-phases', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const gm = data.enemies.find((e) => e.id === 'gravemarrow');
    expect(gm?.boss).toBe(true);
    expect(gm?.relic).toBeTruthy();
    expect(gm?.relicName).toBeTruthy();
    // The marsh dungeon zone exists (dark) and knows its mini-boss.
    const zone = data.zones.find((z) => z.id === 'marshdungeon');
    expect(zone?.dark).toBe(true);
    expect(zone?.enemyTypes).toContain('gravemarrow');
    // It uses the m4 boss systems: multi-phase, with a hazard phase (movement).
    expect((gm?.phases?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(gm?.phases?.some((p) => p.hazard)).toBe(true);
    // Every summoned minion id it references is a real enemy (base + phases).
    const ids = new Set(data.enemies.map((e) => e.id));
    const summons = [gm?.summon?.minion, ...(gm?.phases ?? []).map((p) => p.summon?.minion)].filter(Boolean);
    for (const s of summons) expect(ids, `minion ${s}`).toContain(s);
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

  it('the Mire Watch chain links 5 undead-hunt quests to one Fenwatch giver', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const { startQuest, recordEvent } = await import('../systems/quests.ts');
    const { emptyQuestState } = await import('../systems/save/schema.ts');
    const data = loadGameData();
    const chain = data.quests.filter((q) => q.chain === 'mire_watch');
    expect(chain.length).toBe(5);
    // Linear: every quest but the first is gated behind another mire_watch quest,
    // and all are NPC-given (never auto-offered).
    const chainIds = new Set(chain.map((q) => q.id));
    const gated = chain.filter((q) => q.prerequisites.some((p) => chainIds.has(p)));
    expect(gated.length).toBe(chain.length - 1);
    for (const q of chain) expect(q.autoOffer).toBe(false);
    // A single giver — Warden Sela — offers the whole chain, and she stands in
    // Fenwatch (marshtown) with a real dialogue tree that starts each quest.
    const givers = data.npcs.filter((n) => n.offersQuests.some((id) => chainIds.has(id)));
    expect(givers.length).toBe(1);
    const sela = givers[0]!;
    expect(sela.zone).toBe('marshtown');
    for (const id of chainIds) expect(sela.offersQuests).toContain(id);
    const tree = data.dialogue.find((t) => t.id === sela.dialogue)!;
    const started = new Set<string>();
    for (const node of tree.nodes) for (const c of node.choices) if (c.action?.startsQuest) started.add(c.action.startsQuest);
    for (const id of chainIds) expect(started, `${id} startable`).toContain(id);
    // The kill quests target the marsh's undead roster (data-driven, no code).
    const marshMobs = new Set(['rotshambler', 'bogwraith', 'fenspitter', 'drownhound']);
    for (const q of chain) {
      for (const obj of q.objectives) {
        if (obj.type === 'kill') expect(marshMobs, `${q.id} target`).toContain(obj.target);
      }
    }
    // Functional walk: feed the chain's own objective events and confirm it runs
    // start → finish in order, gating each quest on the previous.
    let state = emptyQuestState();
    for (const q of chain) {
      state = startQuest(data.quests, state, q.id);
      expect(state.active, `${q.id} accepted`).toContain(q.id);
      for (const obj of q.objectives) {
        state = recordEvent(data.quests, state, { type: obj.type, target: obj.target, amount: obj.count }).state;
      }
      expect(state.completed, `${q.id} done`).toContain(q.id);
    }
    expect(chain.every((q) => state.completed.includes(q.id))).toBe(true);
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
    const ctx = (opts: { allRelics?: boolean; completed?: string[] }) => ({
      flags: (opts.allRelics ? { all_relics: true } : {}) as Record<string, boolean>,
      quests: { active: [], completed: opts.completed ?? [], progress: {}, tracked: null },
      catalog: data.quests,
      corruption: 0,
    });

    // Before the relics are gathered, no path is offered — neither the rite-starting
    // choices nor the sealing choices show.
    const emptyChoices = visibleChoices(root, ctx({}));
    expect(emptyChoices.some((c) => c.action?.startsQuest)).toBe(false);
    expect(emptyChoices.some((c) => c.nextNodeId?.startsWith('ask_'))).toBe(false);

    // With every relic in hand, all three rite-starting choices appear, each
    // starting a distinct finale quest — but the endings can't be sealed yet.
    const primed = visibleChoices(root, ctx({ allRelics: true }));
    const startedQuests = new Set(primed.map((c) => c.action?.startsQuest).filter(Boolean));
    expect(startedQuests).toEqual(new Set(['q_end_destroy', 'q_end_control', 'q_end_become']));
    expect(primed.some((c) => c.nextNodeId?.startsWith('ask_'))).toBe(false);

    // Completing a path's rite unlocks exactly that path's seal, which confirms
    // into the matching ending.
    const bridge: Record<string, string> = {
      q_end_destroy: 'destroy',
      q_end_control: 'control',
      q_end_become: 'become',
    };
    for (const [questId, endingId] of Object.entries(bridge)) {
      const withRite = visibleChoices(root, ctx({ allRelics: true, completed: [questId] }));
      const seals = withRite.map((c) => c.nextNodeId).filter((id): id is string => !!id && id.startsWith('ask_'));
      expect(seals.length, `${questId} unlocks one seal`).toBe(1);
      const confirm = shrine.nodes.find((n) => n.id === seals[0])!;
      const seal = confirm.choices.find((c) => c.action?.ending)!;
      expect(seal.action!.ending, `${questId} seals ${endingId}`).toBe(endingId);
    }
  });

  it('the three finale quests bridge the shrine choice to each ending', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const finale = data.quests.filter((q) => q.chain === 'ashes_finale');
    expect(finale.map((q) => q.id)).toEqual(['q_end_destroy', 'q_end_control', 'q_end_become']);
    for (const q of finale) {
      expect(q.autoOffer, `${q.id} is NPC-started`).toBe(false);
      expect(q.objectives.length).toBeGreaterThanOrEqual(1);
    }
    // The shrine dialogue starts every finale quest, and only the shrine does.
    const shrine = data.dialogue.find((t) => t.id === 'shrine')!;
    const startsAtShrine = new Set(
      shrine.nodes.flatMap((n) => n.choices.map((c) => c.action?.startsQuest).filter(Boolean)),
    );
    for (const q of finale) {
      expect(startsAtShrine, `${q.id} started at shrine`).toContain(q.id);
      const otherStarters = data.dialogue
        .filter((t) => t.id !== 'shrine')
        .flatMap((t) => t.nodes.flatMap((n) => n.choices.map((c) => c.action?.startsQuest)));
      expect(otherStarters, `${q.id} started only at shrine`).not.toContain(q.id);
    }
  });

  it('set items reference real slots + affixes and grant escalating bonuses', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const slots = new Set(data.items.slots);
    const affixKeys = new Set(data.affixes.map((a) => a.key));
    expect(data.items.sets.length).toBeGreaterThan(0);
    for (const set of data.items.sets) {
      for (const p of set.pieces) {
        expect(slots, `${set.id} piece slot`).toContain(p.slot);
        for (const aff of p.forcedAffixes) expect(affixKeys, `${set.id} piece affix`).toContain(aff.key);
      }
      // Bonus thresholds are ascending and never exceed the piece count.
      const thresholds = set.bonuses.map((b) => b.pieces);
      expect([...thresholds]).toEqual([...thresholds].sort((a, b) => a - b));
      for (const b of set.bonuses) {
        expect(b.pieces).toBeLessThanOrEqual(set.pieces.length);
        for (const aff of b.affixes) expect(affixKeys, `${set.id} bonus affix`).toContain(aff.key);
      }
    }
  });

  it('the unique roster is 30+, mostly build-changing, and references real ids', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const uniques = data.items.legendaries;
    const affixKeys = new Set(data.affixes.map((a) => a.key));
    const skillIds = new Set(data.skills.map((s) => s.id));
    const powers = new Set<string>();
    const slots = new Set<string>();
    expect(uniques.length).toBeGreaterThanOrEqual(30); // grown to the roadmap target

    for (const u of uniques) {
      expect(powers, `duplicate power ${u.power}`).not.toContain(u.power);
      powers.add(u.power);
      slots.add(u.slot);
      for (const aff of u.forcedAffixes) expect(affixKeys, `${u.power} affix`).toContain(aff.key);
      for (const mod of u.skillMods) expect(skillIds, `${u.power} skillMod skill`).toContain(mod.skill);
      // hook shape is enforced by the schema; nothing extra to check here.
    }
    // Covers every core slot, and at least a third are skill-modifying (the design rule).
    for (const s of ['Weapon', 'Helmet', 'Chest', 'Boots', 'Ring']) expect(slots, `unique for ${s}`).toContain(s);
    const modding = uniques.filter((u) => u.skillMods.length > 0).length;
    expect(modding).toBeGreaterThanOrEqual(Math.ceil(uniques.length / 3));
  });

  it('mythics are a small, build-warping tier with valid references', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const affixKeys = new Set(data.affixes.map((a) => a.key));
    const skillIds = new Set(data.skills.map((s) => s.id));
    const uniquePowers = new Set(data.items.legendaries.map((l) => l.power));
    expect(data.items.mythics.length).toBeGreaterThan(0);
    // A 'mythic' rarity exists but never rolls by weight (boss-only).
    const mythicRarity = data.items.rarities.find((r) => r.id === 'mythic');
    expect(mythicRarity?.dropChance).toBe(0);
    for (const m of data.items.mythics) {
      expect(uniquePowers, `mythic ${m.power} must not clash with a unique`).not.toContain(m.power);
      for (const aff of m.forcedAffixes) expect(affixKeys, `${m.power} affix`).toContain(aff.key);
      for (const mod of m.skillMods) expect(skillIds, `${m.power} skillMod`).toContain(mod.skill);
    }
    // Build-warping: most mythics change how a skill behaves.
    const modding = data.items.mythics.filter((m) => m.skillMods.length > 0).length;
    expect(modding).toBeGreaterThanOrEqual(Math.ceil(data.items.mythics.length / 2));
  });

  it('runes reference real affixes and have positive drop weights', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const affixKeys = new Set(data.affixes.map((a) => a.key));
    expect(data.items.runes.length).toBeGreaterThan(0);
    for (const rune of data.items.runes) {
      expect(rune.weight, `${rune.id} weight`).toBeGreaterThan(0);
      expect(rune.letter.length, `${rune.id} letter`).toBeGreaterThan(0);
      for (const aff of rune.affixes) expect(affixKeys, `${rune.id} affix`).toContain(aff.key);
    }
  });

  it('runewords use real runes/slots/affixes and match socketable bases', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const runeIds = new Set(data.items.runes.map((r) => r.id));
    const affixKeys = new Set(data.affixes.map((a) => a.key));
    const socketable = new Set(['Weapon', 'Helmet', 'Chest']);
    expect(data.items.runewords.length).toBeGreaterThan(0);
    for (const rw of data.items.runewords) {
      expect(rw.runes.length).toBeGreaterThanOrEqual(2);
      for (const r of rw.runes) expect(runeIds, `${rw.id} rune`).toContain(r);
      for (const slot of rw.slots) expect(socketable, `${rw.id} slot`).toContain(slot);
      for (const aff of rw.affixes) expect(affixKeys, `${rw.id} affix`).toContain(aff.key);
    }
  });

  it('Fenwatch (marshtown) offers the full slate of services', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const npcs = data.npcs.filter((n) => n.zone === 'marshtown');
    const services = new Set(npcs.map((n) => n.service).filter(Boolean));
    expect(services).toEqual(new Set(['vendor', 'blacksmith', 'stash']));
    // A dialogue trainer (respec), like Thornhollow's — its tree has a respec choice.
    const trainer = data.dialogue.find((t) => t.id === 'marshtrainer');
    expect(trainer, 'marshtrainer dialogue tree').toBeTruthy();
    const hasRespec = trainer!.nodes.some((n) => n.choices.some((c) => c.action?.respec === true));
    expect(hasRespec).toBe(true);
    // Every marshtown NPC's dialogue tree resolves (no dangling service dialogue).
    const treeIds = new Set(data.dialogue.map((t) => t.id));
    for (const n of npcs) expect(treeIds, `${n.id} dialogue`).toContain(n.dialogue);
  });

  it('the Mirefen is stocked by an undead roster that carries poison', async () => {
    const { loadGameData } = await import('./gameData.ts');
    const data = loadGameData();
    const marsh = data.zones.find((z) => z.id === 'marsh')!;
    const roster = new Set(['rotshambler', 'bogwraith', 'fenspitter', 'drownhound']);
    // The marsh spawns its own roster (no more placeholder skel/bat).
    expect(new Set(marsh.enemyTypes)).toEqual(roster);
    const byId = new Map(data.enemies.map((e) => [e.id, e]));
    // At least one marsh foe inflicts poison — the zone's core mechanic.
    const poisoners = [...roster].map((id) => byId.get(id)!).filter((e) => e.poison);
    expect(poisoners.length).toBeGreaterThanOrEqual(1);
    for (const e of poisoners) {
      expect(e.poison!.dps, `${e.id} poison dps`).toBeGreaterThan(0);
      expect(e.poison!.duration, `${e.id} poison duration`).toBeGreaterThan(0);
      // Poison only lands on contact/slam/charge, so a poisoner must not be a
      // pure kiter — a ranged+keepDistance foe could never apply it.
      expect(e.ranged && e.keepDistance, `${e.id} can land its poison touch`).toBeFalsy();
    }
  });
});
