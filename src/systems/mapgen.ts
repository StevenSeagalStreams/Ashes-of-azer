// Port of the prototype's Starter Plains generator (ashes_of_azer.html).
// Placeholder until Milestone 0.5 replaces generated grids with Tiled maps.

export const TS = 16;
export const MAPW = 60;
export const MAPH = 40;

export const TILE = {
  GRASS: 0,
  TREE: 1,
  WATER: 2,
  PATH: 3,
  DOOR: 4,
  DFLOOR: 5,
  DWALL: 6,
  PORTAL: 7,
  FLOWERS: 8,
} as const;

export const SOLID_TILES: number[] = [TILE.TREE, TILE.WATER, TILE.DWALL];

export const solid = (t: number): boolean => SOLID_TILES.includes(t);

export const tileAt = (grid: number[][], x: number, y: number): number =>
  (grid[y] ?? [])[x] ?? TILE.TREE;

const set = (grid: number[][], x: number, y: number, v: number): void => {
  const row = grid[y];
  if (row) row[x] = v;
};

export function genOverworld(): number[][] {
  const m: number[][] = [];
  for (let y = 0; y < MAPH; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAPW; x++) {
      let t: number = TILE.GRASS;
      if (x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1) t = TILE.TREE;
      else if (Math.random() < 0.07) t = TILE.TREE;
      else if (Math.random() < 0.04) t = TILE.FLOWERS;
      row.push(t);
    }
    m.push(row);
  }
  // lake
  for (let y = 4; y < 11; y++)
    for (let x = 42; x < 54; x++) if (Math.hypot(x - 48, y - 7.5) < 5.5) set(m, x, y, TILE.WATER);
  // path from spawn to dungeon
  for (let x = 8; x < 50; x++) {
    set(m, x, 30, TILE.PATH);
    set(m, x, 31, TILE.PATH);
  }
  for (let y = 18; y < 32; y++) {
    set(m, 48, y, TILE.PATH);
    set(m, 49, y, TILE.PATH);
  }
  // clearing at spawn
  for (let y = 27; y < 35; y++)
    for (let x = 5; x < 15; x++) if (tileAt(m, x, y) === TILE.TREE) set(m, x, y, TILE.GRASS);
  // clearing at dungeon mouth
  for (let y = 14; y < 20; y++)
    for (let x = 44; x < 54; x++) if (tileAt(m, x, y) === TILE.TREE) set(m, x, y, TILE.GRASS);
  // dungeon door
  set(m, 48, 15, TILE.DOOR);
  set(m, 49, 15, TILE.DOOR);
  return m;
}

// Prototype spawn point: player starts on the path in the spawn clearing.
export const SPAWN = { x: 10 * TS, y: 31 * TS };
