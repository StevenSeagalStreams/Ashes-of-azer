import { CURRENT_SAVE_VERSION, SaveSchema, type SaveData } from './schema.ts';

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

// One entry per historical version: MIGRATIONS[n] upgrades a version-n save
// to version n+1 (the walker stamps the new saveVersion itself).
export const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2 (m0.5): zones became real; saves now remember where you are.
  1: (raw) => {
    const world = (raw['world'] ?? {}) as Record<string, unknown>;
    const discovered = Array.isArray(world['discoveredZones']) ? (world['discoveredZones'] as unknown[]) : [];
    return {
      ...raw,
      world: {
        ...world,
        currentZone: 'overworld',
        discoveredZones: discovered.includes('overworld') ? discovered : [...discovered, 'overworld'],
      },
    };
  },
  // v2 → v3 (m1.1): the active-skill loadout became a player choice.
  2: (raw) => ({ ...raw, loadout: { actives: [null, null, null, null, null, null] } }),
  // v3 → v4 (m1.1): six passive slots joined the loadout.
  3: (raw) => {
    const loadout = (raw['loadout'] ?? {}) as Record<string, unknown>;
    return { ...raw, loadout: { ...loadout, passives: [null, null, null, null, null, null] } };
  },
  // v4 → v5 (m1.3): characters gained a class; pre-1.3 saves are Warriors.
  4: (raw) => {
    const character = (raw['character'] ?? {}) as Record<string, unknown>;
    return { ...raw, character: { ...character, class: 'warrior' } };
  },
  // v5 → v6 (m2.1): quest progress joins the save; older saves start with none.
  5: (raw) => ({ ...raw, quests: { active: [], completed: [], progress: {}, tracked: null } }),
  // v6 → v7 (m2.3): a shared stash chest; older saves start with an empty one.
  6: (raw) => ({ ...raw, stash: Array.isArray(raw['stash']) ? raw['stash'] : [] }),
  // v7 → v8 (m2.3): items gained optional durability; existing items lack it and
  // stay indestructible, so nothing to fill — just bump the version.
  7: (raw) => ({ ...raw }),
  // v8 → v9 (m2.3): crafting materials join the save; older saves start empty.
  8: (raw) => ({ ...raw, materials: (raw['materials'] ?? {}) as Record<string, unknown> }),
  // v9 → v10 (m2.4): collected relic fragments; older saves start with none.
  9: (raw) => ({ ...raw, relics: Array.isArray(raw['relics']) ? raw['relics'] : [] }),
  // v10 → v11 (m2.4): faction reputation; older saves start at zero everywhere.
  10: (raw) => ({ ...raw, reputation: (raw['reputation'] ?? {}) as Record<string, unknown> }),
  // v11 → v12 (m2.4): discovered secrets; older saves have found none.
  11: (raw) => ({ ...raw, secrets: Array.isArray(raw['secrets']) ? raw['secrets'] : [] }),
  // v12 → v13 (m4.x): D2 rarity ladder — relabel stored items so old drops match
  // the new ladder (legendary → unique, the dropped epic tier → rare). Purely a
  // display relabel; affixes/base/durability are untouched.
  12: (raw) => {
    const remapRarity = (r: unknown): unknown => (r === 'legendary' ? 'unique' : r === 'epic' ? 'rare' : r);
    const fixItem = (it: unknown): unknown =>
      it && typeof it === 'object' ? { ...(it as Record<string, unknown>), rarity: remapRarity((it as Record<string, unknown>)['rarity']) } : it;
    const gearRaw = (raw['gear'] ?? {}) as Record<string, unknown>;
    const gear: Record<string, unknown> = {};
    for (const [slot, item] of Object.entries(gearRaw)) gear[slot] = fixItem(item);
    const fixArr = (a: unknown): unknown[] => (Array.isArray(a) ? a.map(fixItem) : []);
    return { ...raw, gear, bag: fixArr(raw['bag']), stash: fixArr(raw['stash']) };
  },
  // v13 → v14 (m4.x): a rune inventory for socketing; older saves start empty.
  13: (raw) => ({ ...raw, runes: Array.isArray(raw['runes']) ? raw['runes'] : [] }),
};

/** Walks a raw save from its own version up to targetVersion. Pure. */
export function applyMigrations(
  raw: unknown,
  migrations: Record<number, Migration>,
  targetVersion: number,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SaveError('save data is not an object');
  }
  let obj = raw as Record<string, unknown>;
  const v = obj['saveVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new SaveError(`save has no valid saveVersion (got ${JSON.stringify(v)})`);
  }
  if (v > targetVersion) {
    throw new SaveError(`save version ${v} is newer than this build supports (${targetVersion})`);
  }
  for (let from = v; from < targetVersion; from++) {
    const step = migrations[from];
    if (!step) throw new SaveError(`no migration path from save version ${from}`);
    obj = { ...step(obj), saveVersion: from + 1 };
  }
  return obj;
}

/** Migrates to the current version and validates against the live schema. */
export function migrateAndValidate(raw: unknown): SaveData {
  const obj = applyMigrations(raw, MIGRATIONS, CURRENT_SAVE_VERSION);
  const parsed = SaveSchema.safeParse(obj);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new SaveError(`migrated save failed validation: ${issues}`);
  }
  return parsed.data;
}
