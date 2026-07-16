import { CURRENT_SAVE_VERSION, SaveSchema, type SaveData } from './schema.ts';

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

// One entry per historical version: MIGRATIONS[n] upgrades a version-n save
// to version n+1. Empty today because v1 is the first format — but the
// walking logic below is live from the start, so old saves survive every
// future format change by adding one function here (plus bumping
// CURRENT_SAVE_VERSION and the schema).
export const MIGRATIONS: Record<number, Migration> = {};

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
