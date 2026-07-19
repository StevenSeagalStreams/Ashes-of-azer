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
