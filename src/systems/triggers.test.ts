import { describe, expect, it } from 'vitest';
import { MapParseError, parseMapObjects, rectContains, triggerAt } from './triggers.ts';

const player = { name: 'player', type: 'player_spawn', point: true, x: 160, y: 496 };

describe('parseMapObjects', () => {
  it('parses the full convention set (array-style properties, as in raw Tiled JSON)', () => {
    const spawns = [
      player,
      {
        name: 'mob-1',
        type: 'enemy_spawn',
        point: true,
        x: 128,
        y: 512,
        properties: [{ name: 'pool', value: 'skel,bat' }],
      },
      {
        name: 'field',
        type: 'enemy_region',
        x: 16,
        y: 16,
        width: 928,
        height: 608,
        properties: [
          { name: 'count', value: 14 },
          { name: 'respawn', value: true },
          { name: 'respawnCap', value: 10 },
          { name: 'respawnInterval', value: 4 },
        ],
      },
    ];
    const triggers = [
      {
        name: 'door',
        type: 'transition',
        x: 768,
        y: 240,
        width: 32,
        height: 16,
        properties: [
          { name: 'target', value: 'dungeon' },
          { name: 'targetX', value: 104 },
          { name: 'targetY', value: 496 },
        ],
      },
      { name: 'well', type: 'heal', x: 108, y: 444, width: 40, height: 40, properties: [{ name: 'rate', value: 20 }] },
      {
        name: 'intro',
        type: 'cutscene',
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        properties: [{ name: 'cutsceneId', value: 'intro' }],
      },
    ];
    const out = parseMapObjects(spawns, triggers);
    expect(out.playerSpawn).toEqual({ x: 160, y: 496 });
    expect(out.enemySpawnPoints).toEqual([{ x: 128, y: 512, pool: ['skel', 'bat'] }]);
    expect(out.enemyRegions[0]).toEqual({
      rect: { x: 16, y: 16, width: 928, height: 608 },
      count: 14,
      pool: null,
      respawn: true,
      respawnCap: 10,
      respawnInterval: 4,
    });
    expect(out.triggers).toHaveLength(3);
    expect(out.triggers[0]).toEqual({
      kind: 'transition',
      rect: { x: 768, y: 240, width: 32, height: 16 },
      target: 'dungeon',
      targetX: 104,
      targetY: 496,
    });
    expect(out.triggers[1]).toEqual({ kind: 'heal', rect: { x: 108, y: 444, width: 40, height: 40 }, rate: 20 });
    expect(out.triggers[2]).toEqual({
      kind: 'cutscene',
      rect: { x: 0, y: 0, width: 16, height: 16 },
      cutsceneId: 'intro',
    });
  });

  it('accepts record-style properties (as Phaser sometimes converts them)', () => {
    const spawns = [player, { type: 'enemy_spawn', point: true, x: 1, y: 2, properties: { pool: 'slime' } }];
    const out = parseMapObjects(spawns, []);
    expect(out.enemySpawnPoints[0]?.pool).toEqual(['slime']);
  });

  it('defaults pool to null (zone enemyTypes) when absent', () => {
    const out = parseMapObjects([player, { type: 'enemy_spawn', point: true, x: 1, y: 2 }], []);
    expect(out.enemySpawnPoints[0]?.pool).toBeNull();
  });

  it('fails loudly on unknown object types', () => {
    expect(() => parseMapObjects([player, { type: 'enemy_spwan', x: 1, y: 2 }], [])).toThrow(MapParseError);
    expect(() => parseMapObjects([player], [{ type: 'teleport', x: 0, y: 0, width: 8, height: 8 }])).toThrow(
      MapParseError,
    );
  });

  it('fails loudly on a missing player_spawn or duplicates', () => {
    expect(() => parseMapObjects([], [])).toThrow(/no player_spawn/);
    expect(() => parseMapObjects([player, player], [])).toThrow(/multiple player_spawn/);
  });

  it('fails loudly on a transition without a target', () => {
    const t = [{ type: 'transition', x: 0, y: 0, width: 8, height: 8, properties: [{ name: 'targetX', value: 1 }] }];
    expect(() => parseMapObjects([player], t)).toThrow(MapParseError);
  });

  it('fails loudly on a region trigger drawn as a point (no size)', () => {
    const t = [{ type: 'heal', x: 5, y: 5, properties: [{ name: 'rate', value: 20 }] }];
    expect(() => parseMapObjects([player], t)).toThrow(/rectangle/);
  });
});

describe('rectContains / triggerAt', () => {
  const heal = { kind: 'heal' as const, rect: { x: 10, y: 10, width: 20, height: 20 }, rate: 20 };

  it('includes the top-left edge and excludes the bottom-right edge', () => {
    expect(rectContains(heal.rect, 10, 10)).toBe(true);
    expect(rectContains(heal.rect, 30, 30)).toBe(false);
    expect(rectContains(heal.rect, 29.9, 29.9)).toBe(true);
  });

  it('finds the trigger under a point, or null', () => {
    expect(triggerAt([heal], 15, 15)).toBe(heal);
    expect(triggerAt([heal], 50, 50)).toBeNull();
  });
});
