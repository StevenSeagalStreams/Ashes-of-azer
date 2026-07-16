import { describe, expect, it } from 'vitest';
import { exportSave, importSave } from './codec.ts';
import { applyMigrations, migrateAndValidate, SaveError, type Migration } from './migrations.ts';
import { CURRENT_SAVE_VERSION, defaultSave, SaveSchema } from './schema.ts';
import { SaveStore, type StorageLike } from './store.ts';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('SaveSchema / defaultSave', () => {
  it('produces a valid default save', () => {
    expect(SaveSchema.safeParse(defaultSave()).success).toBe(true);
  });

  it('accepts a save carrying real progress', () => {
    const save = defaultSave();
    save.character = { level: 7, xp: 320, gold: 41 };
    save.gear = {
      Ring: {
        slot: 'Ring',
        name: 'Frostheart',
        base: 5,
        rarity: 'legendary',
        affixes: [{ key: 'frost', value: 30 }],
        power: 'frostheart',
      },
    };
    save.skillRanks = { shield_slam: 3 };
    save.world.killedBosses = ['boss'];
    expect(SaveSchema.safeParse(save).success).toBe(true);
  });

  it('rejects a save with a wrong version literal', () => {
    const bad = { ...defaultSave(), saveVersion: 99 };
    expect(SaveSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative gold and out-of-range corruption', () => {
    const bad1 = defaultSave();
    bad1.character.gold = -5;
    expect(SaveSchema.safeParse(bad1).success).toBe(false);
    const bad2 = defaultSave();
    bad2.world.corruption = 150;
    expect(SaveSchema.safeParse(bad2).success).toBe(false);
  });
});

describe('applyMigrations', () => {
  it('walks a synthetic multi-step chain in order', () => {
    const migrations: Record<number, Migration> = {
      1: (raw) => ({ ...raw, addedInV2: true }),
      2: (raw) => ({ ...raw, addedInV3: (raw['addedInV2'] as boolean) ? 'yes' : 'no' }),
    };
    const out = applyMigrations({ saveVersion: 1 }, migrations, 3);
    expect(out).toEqual({ saveVersion: 3, addedInV2: true, addedInV3: 'yes' });
  });

  it('is a no-op when already at the target version', () => {
    const out = applyMigrations({ saveVersion: 2, x: 1 }, {}, 2);
    expect(out).toEqual({ saveVersion: 2, x: 1 });
  });

  it('throws on a gap in the migration chain', () => {
    expect(() => applyMigrations({ saveVersion: 1 }, {}, 2)).toThrow(SaveError);
  });

  it('throws on a save newer than the build supports', () => {
    expect(() => applyMigrations({ saveVersion: 5 }, {}, 2)).toThrow(/newer than this build/);
  });

  it('throws on garbage input', () => {
    expect(() => applyMigrations('nope', {}, 1)).toThrow(SaveError);
    expect(() => applyMigrations(null, {}, 1)).toThrow(SaveError);
    expect(() => applyMigrations({ saveVersion: 'one' }, {}, 1)).toThrow(SaveError);
  });
});

describe('migrateAndValidate (real chain)', () => {
  it('passes a current-version save through', () => {
    const save = defaultSave();
    expect(migrateAndValidate(save)).toEqual(save);
  });

  it('upgrades a real v1 save to the current version (v1 had no currentZone)', () => {
    const v1 = {
      saveVersion: 1,
      updatedAt: 123,
      character: { level: 5, xp: 700, gold: 12 },
      gear: {},
      bag: [],
      skillRanks: { whirlwind: 2 },
      world: { questFlags: { met_elder: true }, killedBosses: ['boss'], discoveredZones: [], corruption: 25 },
    };
    const out = migrateAndValidate(v1);
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(out.world.currentZone).toBe('overworld');
    expect(out.world.discoveredZones).toContain('overworld');
    // Nothing else was lost in the upgrade.
    expect(out.character).toEqual(v1.character);
    expect(out.skillRanks).toEqual(v1.skillRanks);
    expect(out.world.killedBosses).toEqual(['boss']);
    expect(out.world.corruption).toBe(25);
  });

  it('rejects a structurally invalid save even at the right version', () => {
    const bad = { saveVersion: CURRENT_SAVE_VERSION, character: { level: 0 } };
    expect(() => migrateAndValidate(bad)).toThrow(SaveError);
  });
});

describe('export/import codec', () => {
  it('round-trips a save through base64 exactly', () => {
    const save = defaultSave();
    save.character = { level: 9, xp: 1234, gold: 567 };
    save.world.questFlags = { met_elder: true, kills: 42, note: 'Zürich ⚔️' }; // unicode-safe check
    expect(importSave(exportSave(save))).toEqual(save);
  });

  it('rejects non-base64 garbage', () => {
    expect(() => importSave('!!!not-base64!!!')).toThrow(SaveError);
  });

  it('rejects base64 of non-JSON', () => {
    expect(() => importSave(btoa('hello world'))).toThrow(SaveError);
  });

  it('rejects base64 JSON that is not a valid save', () => {
    expect(() => importSave(btoa(JSON.stringify({ hello: 1 })))).toThrow(SaveError);
  });
});

describe('SaveStore', () => {
  it('saves, loads and deletes per slot', () => {
    const store = new SaveStore(memoryStorage());
    const save = defaultSave();
    save.character.level = 4;
    store.save(1, save);
    expect(store.load(1)?.character.level).toBe(4);
    expect(store.load(2)).toBeNull();
    store.delete(1);
    expect(store.load(1)).toBeNull();
  });

  it('stamps updatedAt on save', () => {
    const store = new SaveStore(memoryStorage());
    const before = Date.now();
    store.save(1, { ...defaultSave(0) });
    const loaded = store.load(1);
    expect(loaded && loaded.updatedAt >= before).toBe(true);
  });

  it('throws SaveError on corrupt slot data, distinguishable from empty', () => {
    const storage = memoryStorage();
    storage.setItem('azer:save:1', '{corrupt json');
    const store = new SaveStore(storage);
    expect(() => store.load(1)).toThrow(SaveError);
    expect(store.load(2)).toBeNull(); // empty is null, not an error
  });

  it('lists all three slots, treating corrupt ones as empty in the summary', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.save(2, defaultSave());
    storage.setItem('azer:save:3', 'garbage');
    const summary = store.list();
    expect(summary.map((s) => s.slot)).toEqual([1, 2, 3]);
    expect(summary[0]?.save).toBeNull();
    expect(summary[1]?.save?.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(summary[2]?.save).toBeNull();
  });
});
