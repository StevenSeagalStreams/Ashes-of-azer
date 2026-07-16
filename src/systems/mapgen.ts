// Tile constants + walkability helpers. The prototype's procedural map
// generators that used to live here were retired in Milestone 0.5 — maps
// are authored Tiled JSON now (assets/maps/, generated once by
// scripts/generate-maps.mjs and hand-editable since).

export const TS = 16;

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

/**
 * Prototype walkable(): a point is walkable when none of the four corners
 * of a radius-r box around it sits on a solid tile. `mask[y][x]` is true
 * where the tile is solid; out-of-bounds counts as solid.
 */
export function walkableMask(mask: boolean[][], px: number, py: number, r: number): boolean {
  const solidAt = (x: number, y: number): boolean =>
    (mask[Math.floor(y / TS)] ?? [])[Math.floor(x / TS)] ?? true;
  return !solidAt(px - r, py - r) && !solidAt(px + r, py - r) && !solidAt(px - r, py + r) && !solidAt(px + r, py + r);
}
