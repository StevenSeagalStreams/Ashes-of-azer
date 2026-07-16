import { z } from 'zod';

// Parses the `spawns` and `triggers` object layers of a Tiled map into
// typed structures, per the conventions in assets/maps/README.md.
// Unknown object types fail loudly — a typo in a map surfaces at load,
// never as silently missing behaviour.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rectContains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

export interface PlayerSpawn {
  x: number;
  y: number;
}
export interface EnemySpawnPoint {
  x: number;
  y: number;
  pool: string[] | null; // null = zone default
}
export interface EnemyRegion {
  rect: Rect;
  count: number;
  pool: string[] | null;
  respawn: boolean;
  respawnCap: number;
  respawnInterval: number;
}
export interface TransitionTrigger {
  kind: 'transition';
  rect: Rect;
  target: string;
  targetX: number;
  targetY: number;
}
export interface HealTrigger {
  kind: 'heal';
  rect: Rect;
  rate: number;
}
export interface CutsceneTrigger {
  kind: 'cutscene';
  rect: Rect;
  cutsceneId: string; // reserved — no runtime behaviour until m2.x
}
export type Trigger = TransitionTrigger | HealTrigger | CutsceneTrigger;

export interface MapObjects {
  playerSpawn: PlayerSpawn;
  enemySpawnPoints: EnemySpawnPoint[];
  enemyRegions: EnemyRegion[];
  triggers: Trigger[];
}

// Tiled objects as Phaser hands them over (properties may be the raw Tiled
// array or already converted to a record — both are handled).
const TiledPropertySchema = z.object({ name: z.string(), value: z.unknown() });
const TiledObjectSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  point: z.boolean().optional(),
  properties: z.union([z.array(TiledPropertySchema), z.record(z.string(), z.unknown())]).optional(),
});
type TiledObject = z.infer<typeof TiledObjectSchema>;

export class MapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapParseError';
  }
}

function props(obj: TiledObject): Record<string, unknown> {
  if (!obj.properties) return {};
  if (Array.isArray(obj.properties)) {
    return Object.fromEntries(obj.properties.map((p) => [p.name, p.value]));
  }
  return obj.properties;
}

function num(p: Record<string, unknown>, key: string, fallback?: number): number {
  const v = p[key];
  if (typeof v === 'number') return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new MapParseError(`missing/invalid numeric property "${key}"`);
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v === 'string' && v.length > 0) return v;
  throw new MapParseError(`missing/invalid string property "${key}"`);
}

function bool(p: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = p[key];
  if (typeof v === 'boolean') return v;
  if (v === undefined) return fallback;
  throw new MapParseError(`invalid boolean property "${key}"`);
}

function poolOf(p: Record<string, unknown>): string[] | null {
  const v = p['pool'];
  if (v === undefined) return null;
  if (typeof v !== 'string') throw new MapParseError('invalid "pool" property');
  const ids = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) throw new MapParseError('empty "pool" property');
  return ids;
}

function rectOf(obj: TiledObject, what: string): Rect {
  const { x, y, width, height } = obj;
  if (x === undefined || y === undefined || !width || !height) {
    throw new MapParseError(`${what} object must be a rectangle with width/height`);
  }
  return { x, y, width, height };
}

function pointOf(obj: TiledObject, what: string): { x: number; y: number } {
  if (obj.x === undefined || obj.y === undefined) {
    throw new MapParseError(`${what} object is missing coordinates`);
  }
  return { x: obj.x, y: obj.y };
}

export function parseMapObjects(spawnObjects: unknown[], triggerObjects: unknown[]): MapObjects {
  const out: MapObjects = { playerSpawn: { x: 0, y: 0 }, enemySpawnPoints: [], enemyRegions: [], triggers: [] };
  let sawPlayer = false;

  for (const rawObj of spawnObjects) {
    const obj = TiledObjectSchema.parse(rawObj);
    const p = props(obj);
    switch (obj.type) {
      case 'player_spawn': {
        if (sawPlayer) throw new MapParseError('multiple player_spawn objects');
        out.playerSpawn = pointOf(obj, 'player_spawn');
        sawPlayer = true;
        break;
      }
      case 'enemy_spawn':
        out.enemySpawnPoints.push({ ...pointOf(obj, 'enemy_spawn'), pool: poolOf(p) });
        break;
      case 'enemy_region':
        out.enemyRegions.push({
          rect: rectOf(obj, 'enemy_region'),
          count: num(p, 'count'),
          pool: poolOf(p),
          respawn: bool(p, 'respawn', false),
          respawnCap: num(p, 'respawnCap', 0),
          respawnInterval: num(p, 'respawnInterval', 4),
        });
        break;
      default:
        throw new MapParseError(`unknown spawns object type "${obj.type ?? ''}" (${obj.name ?? 'unnamed'})`);
    }
  }
  if (!sawPlayer) throw new MapParseError('map has no player_spawn');

  for (const rawObj of triggerObjects) {
    const obj = TiledObjectSchema.parse(rawObj);
    const p = props(obj);
    switch (obj.type) {
      case 'transition':
        out.triggers.push({
          kind: 'transition',
          rect: rectOf(obj, 'transition'),
          target: str(p, 'target'),
          targetX: num(p, 'targetX'),
          targetY: num(p, 'targetY'),
        });
        break;
      case 'heal':
        out.triggers.push({ kind: 'heal', rect: rectOf(obj, 'heal'), rate: num(p, 'rate') });
        break;
      case 'cutscene':
        out.triggers.push({ kind: 'cutscene', rect: rectOf(obj, 'cutscene'), cutsceneId: str(p, 'cutsceneId') });
        break;
      default:
        throw new MapParseError(`unknown triggers object type "${obj.type ?? ''}" (${obj.name ?? 'unnamed'})`);
    }
  }

  return out;
}

/** First trigger whose rect contains (x, y), or null. */
export function triggerAt(triggers: Trigger[], x: number, y: number): Trigger | null {
  for (const t of triggers) if (rectContains(t.rect, x, y)) return t;
  return null;
}
