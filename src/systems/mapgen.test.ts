import { describe, expect, it } from 'vitest';
import { genOverworld, MAPH, MAPW, solid, TILE, tileAt } from './mapgen.ts';

describe('solid', () => {
  it('marks trees, water and dungeon walls as solid', () => {
    expect(solid(TILE.TREE)).toBe(true);
    expect(solid(TILE.WATER)).toBe(true);
    expect(solid(TILE.DWALL)).toBe(true);
  });

  it('marks walkable tiles as not solid', () => {
    for (const t of [TILE.GRASS, TILE.PATH, TILE.DOOR, TILE.DFLOOR, TILE.PORTAL, TILE.FLOWERS]) {
      expect(solid(t)).toBe(false);
    }
  });
});

describe('genOverworld', () => {
  const grid = genOverworld();

  it('has the prototype dimensions', () => {
    expect(grid).toHaveLength(MAPH);
    for (const row of grid) expect(row).toHaveLength(MAPW);
  });

  it('borders the whole map with trees', () => {
    for (let x = 0; x < MAPW; x++) {
      expect(tileAt(grid, x, 0)).toBe(TILE.TREE);
      expect(tileAt(grid, x, MAPH - 1)).toBe(TILE.TREE);
    }
    for (let y = 0; y < MAPH; y++) {
      expect(tileAt(grid, 0, y)).toBe(TILE.TREE);
      expect(tileAt(grid, MAPW - 1, y)).toBe(TILE.TREE);
    }
  });

  it('carves the path from spawn toward the dungeon', () => {
    for (let x = 8; x < 50; x++) {
      expect(tileAt(grid, x, 30)).toBe(TILE.PATH);
      expect(tileAt(grid, x, 31)).toBe(TILE.PATH);
    }
    for (let y = 18; y < 32; y++) {
      expect(tileAt(grid, 48, y)).toBe(TILE.PATH);
      expect(tileAt(grid, 49, y)).toBe(TILE.PATH);
    }
  });

  it('places the dungeon door at the prototype location', () => {
    expect(tileAt(grid, 48, 15)).toBe(TILE.DOOR);
    expect(tileAt(grid, 49, 15)).toBe(TILE.DOOR);
  });

  it('digs the lake', () => {
    expect(tileAt(grid, 48, 7)).toBe(TILE.WATER);
    expect(tileAt(grid, 48, 8)).toBe(TILE.WATER);
  });

  it('keeps the spawn clearing free of trees', () => {
    for (let y = 27; y < 35; y++)
      for (let x = 5; x < 15; x++) expect(tileAt(grid, x, y)).not.toBe(TILE.TREE);
  });

  it('treats out-of-bounds lookups as solid trees', () => {
    expect(tileAt(grid, -1, 5)).toBe(TILE.TREE);
    expect(tileAt(grid, 5, MAPH)).toBe(TILE.TREE);
  });
});
