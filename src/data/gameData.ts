import affixes from '../../data/affixes.json';
import dialogue from '../../data/dialogue.json';
import enemies from '../../data/enemies.json';
import items from '../../data/items.json';
import quests from '../../data/quests.json';
import skills from '../../data/skills.json';
import zones from '../../data/zones.json';
import { validateGameData, type GameData } from './loader.ts';

let cached: GameData | null = null;

/** Validates /data/*.json once and caches the result for the session. */
export function loadGameData(): GameData {
  cached ??= validateGameData({ enemies, affixes, items, skills, zones, quests, dialogue });
  return cached;
}
