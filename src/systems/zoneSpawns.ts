import type { GameData } from '../data/loader.ts';
import type { EnemyData } from '../data/schemas/index.ts';

/**
 * Resolves the enemy defs spawnable in a zone by cross-referencing
 * data/zones.json's enemyTypes against data/enemies.json — the mechanism
 * that makes "add a new enemy type by editing JSON only" true: nothing here
 * names a specific enemy id, so adding one to both JSON files is sufficient.
 * Fails loudly (throws) rather than silently spawning nothing if a zone
 * references an enemy id that doesn't exist.
 */
export function zoneEnemyDefs(data: GameData, zoneId: string): EnemyData[] {
  const zone = data.zones.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`zone "${zoneId}" not found in zones.json`);
  const byId = new Map(data.enemies.map((e) => [e.id, e]));
  return zone.enemyTypes.map((id) => {
    const def = byId.get(id);
    if (!def) throw new Error(`zone "${zoneId}" references unknown enemy id "${id}"`);
    return def;
  });
}
