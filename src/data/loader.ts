import { z } from 'zod';
import {
  AffixesFileSchema,
  DialogueFileSchema,
  EnemiesFileSchema,
  ItemsFileSchema,
  NpcsFileSchema,
  QuestsFileSchema,
  SkillsFileSchema,
  ZonesFileSchema,
  type AffixesFile,
  type DialogueFile,
  type EnemiesFile,
  type ItemsFile,
  type NpcsFile,
  type QuestsFile,
  type SkillsFile,
  type ZonesFile,
} from './schemas/index.ts';

export interface GameData {
  enemies: EnemiesFile;
  affixes: AffixesFile;
  items: ItemsFile;
  skills: SkillsFile;
  zones: ZonesFile;
  quests: QuestsFile;
  dialogue: DialogueFile;
  npcs: NpcsFile;
}

/**
 * Thrown when one or more /data/*.json files fail schema validation.
 * `issues` lists every problem across every file — the loader never fails
 * silently or stops at the first error, per CLAUDE.md ("fails loudly").
 */
export class DataValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid game data:\n${issues.join('\n')}`);
    this.name = 'DataValidationError';
  }
}

function parseFile<T>(fileName: string, schema: z.ZodType<T>, raw: unknown, issues: string[]): T | null {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '(root)';
    issues.push(`${fileName}: ${path}: ${issue.message}`);
  }
  return null;
}

/**
 * Validates a set of already-parsed JSON payloads against their schemas.
 * Pure and dependency-free — used by both the real boot-time loader (fed
 * from Vite's bundled JSON imports) and by tests (fed hand-built fixtures),
 * so "fails loudly on invalid data" is verifiable without touching disk.
 */
export function validateGameData(raw: {
  enemies: unknown;
  affixes: unknown;
  items: unknown;
  skills: unknown;
  zones: unknown;
  quests: unknown;
  dialogue: unknown;
  npcs: unknown;
}): GameData {
  const issues: string[] = [];
  const enemies = parseFile('enemies.json', EnemiesFileSchema, raw.enemies, issues);
  const affixes = parseFile('affixes.json', AffixesFileSchema, raw.affixes, issues);
  const items = parseFile('items.json', ItemsFileSchema, raw.items, issues);
  const skills = parseFile('skills.json', SkillsFileSchema, raw.skills, issues);
  const zones = parseFile('zones.json', ZonesFileSchema, raw.zones, issues);
  const quests = parseFile('quests.json', QuestsFileSchema, raw.quests, issues);
  const dialogue = parseFile('dialogue.json', DialogueFileSchema, raw.dialogue, issues);
  const npcs = parseFile('npcs.json', NpcsFileSchema, raw.npcs, issues);

  if (issues.length > 0) throw new DataValidationError(issues);

  // Non-null by construction: issues is empty only when every parseFile call succeeded.
  return { enemies, affixes, items, skills, zones, quests, dialogue, npcs } as GameData;
}
