import { describe, expect, it } from 'vitest';
import forestMap from '../../assets/maps/forest.json' assert { type: 'json' };
import forestTownMap from '../../assets/maps/foresttown.json' assert { type: 'json' };
import forestDungeonMap from '../../assets/maps/forestdungeon.json' assert { type: 'json' };
import plains from '../../assets/maps/overworld.json' assert { type: 'json' };
import { TILE } from './mapgen.ts';

// Solid tile GIDs (Tiled GIDs are the tile id + 1). These are the tiles the
// generator marks solid; a walkable landing spot must not be one of them.
const SOLID_GIDS = new Set([TILE.TREE + 1, TILE.WATER + 1, TILE.DWALL + 1, TILE.PINE + 1]);

interface TiledMap {
  width: number;
  height: number;
  layers: { name: string; type: string; data?: number[]; objects?: unknown[] }[];
  tilesets: { tilecount: number }[];
}

const groundGid = (map: TiledMap, px: number, py: number): number => {
  const g = map.layers.find((l) => l.name === 'ground')!;
  const tx = Math.floor(px / 16);
  const ty = Math.floor(py / 16);
  return g.data![ty * map.width + tx]!;
};

const transitions = (map: TiledMap): { name: string; props: Record<string, unknown> }[] => {
  const layer = map.layers.find((l) => l.name === 'triggers');
  return (layer?.objects ?? [])
    .map((o) => o as { name: string; type: string; properties?: { name: string; value: unknown }[] })
    .filter((o) => o.type === 'transition')
    .map((o) => ({ name: o.name, props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])) }));
};

const playerSpawn = (map: TiledMap): { x: number; y: number } => {
  const layer = map.layers.find((l) => l.name === 'spawns');
  const p = (layer!.objects as { type: string; x: number; y: number }[]).find((o) => o.type === 'player_spawn')!;
  return { x: p.x, y: p.y };
};

describe('Verdant Reach (forest) map', () => {
  const forest = forestMap as unknown as TiledMap;
  const world = plains as unknown as TiledMap;

  it('is ~3× the Starter Plains and carries the standard layers + tileset', () => {
    expect(forest.width * forest.height).toBe(7200); // 100×72 = 3 × (60×40)
    expect(forest.layers.map((l) => l.name)).toEqual(['ground', 'spawns', 'triggers']);
    expect(forest.tilesets[0]?.tilecount).toBe(12); // includes the new forest tiles
  });

  it('spawns the player on a walkable tile', () => {
    const s = playerSpawn(forest);
    expect(SOLID_GIDS.has(groundGid(forest, s.x, s.y))).toBe(false);
  });

  it('links to the plains and back, landing both ways on walkable ground', () => {
    // Overworld → forest.
    const toForest = transitions(world).find((t) => t.props['target'] === 'forest');
    expect(toForest, 'overworld has a forest gate').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(forest, toForest!.props['targetX'] as number, toForest!.props['targetY'] as number))).toBe(false);

    // Forest → overworld.
    const toPlains = transitions(forest).find((t) => t.props['target'] === 'overworld');
    expect(toPlains, 'forest has a plains gate').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(world, toPlains!.props['targetX'] as number, toPlains!.props['targetY'] as number))).toBe(false);
  });

  it('uses the new forest tiles somewhere in its ground layer', () => {
    const data = (forest.layers.find((l) => l.name === 'ground')!.data as number[]);
    expect(data).toContain(TILE.FOREST + 1);
    expect(data).toContain(TILE.PINE + 1);
  });

  it('places the open-world boss (greathorn) on walkable ground', () => {
    const wb = (forest.layers.find((l) => l.name === 'spawns')!.objects as { type: string; x: number; y: number; properties?: { name: string; value: unknown }[] }[])
      .find((o) => o.type === 'world_boss');
    expect(wb, 'forest has a world_boss object').toBeTruthy();
    const pool = String((wb!.properties ?? []).find((p) => p.name === 'pool')?.value ?? '');
    expect(pool).toContain('greathorn');
    expect(SOLID_GIDS.has(groundGid(forest, wb!.x, wb!.y))).toBe(false);
  });
});

describe('Thornhollow (forest town) map', () => {
  const forest = forestMap as unknown as TiledMap;
  const town = forestTownMap as unknown as TiledMap;

  it('is a standard 60×40 town on the forest floor with a healing well', () => {
    expect(town.width).toBe(60);
    expect(town.height).toBe(40);
    const data = town.layers.find((l) => l.name === 'ground')!.data as number[];
    expect(data).toContain(TILE.FOREST + 1); // forest floor, not plains grass
    const heals = (town.layers.find((l) => l.name === 'triggers')!.objects as { type: string }[]).filter((o) => o.type === 'heal');
    expect(heals.length).toBe(1);
  });

  it('spawns the player on a walkable tile', () => {
    const s = playerSpawn(town);
    expect(SOLID_GIDS.has(groundGid(town, s.x, s.y))).toBe(false);
  });

  it('links to the Reach and back, landing both ways on walkable ground', () => {
    const toTown = transitions(forest).find((t) => t.props['target'] === 'foresttown');
    expect(toTown, 'forest has a town gate').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(town, toTown!.props['targetX'] as number, toTown!.props['targetY'] as number))).toBe(false);

    const toForest = transitions(town).find((t) => t.props['target'] === 'forest');
    expect(toForest, 'town has a reach gate').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(forest, toForest!.props['targetX'] as number, toForest!.props['targetY'] as number))).toBe(false);
  });
});

describe('Bramblewarren (forest dungeon) map', () => {
  const forest = forestMap as unknown as TiledMap;
  const dungeon = forestDungeonMap as unknown as TiledMap;

  const enemyPools = (map: TiledMap): string[] =>
    (map.layers.find((l) => l.name === 'spawns')!.objects as { type: string; properties?: { name: string; value: unknown }[] }[])
      .filter((o) => o.type === 'enemy_spawn')
      .flatMap((o) => String((o.properties ?? []).find((p) => p.name === 'pool')?.value ?? '').split(','));

  it('spawns the player on a walkable tile with the mini-boss placed', () => {
    const s = playerSpawn(dungeon);
    expect(SOLID_GIDS.has(groundGid(dungeon, s.x, s.y))).toBe(false);
    expect(enemyPools(dungeon)).toContain('mossmaw'); // the mini-boss chamber
  });

  it('is reachable from the Reach and exits back, landing both ways walkable', () => {
    const toDungeon = transitions(forest).find((t) => t.props['target'] === 'forestdungeon');
    expect(toDungeon, 'forest has a barrow gate').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(dungeon, toDungeon!.props['targetX'] as number, toDungeon!.props['targetY'] as number))).toBe(false);

    const toForest = transitions(dungeon).find((t) => t.props['target'] === 'forest');
    expect(toForest, 'dungeon has an exit portal').toBeTruthy();
    expect(SOLID_GIDS.has(groundGid(forest, toForest!.props['targetX'] as number, toForest!.props['targetY'] as number))).toBe(false);
  });
});
