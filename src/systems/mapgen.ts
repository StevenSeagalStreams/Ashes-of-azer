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
  // Forest Kingdom set (m2.4): darker floor, solid conifers, mushroom decor.
  FOREST: 9, // dark forest floor (walkable)
  PINE: 10, // tall conifer (solid)
  MUSHROOM: 11, // decor on the forest floor (walkable)
  // Secret false walls (m2.4): drawn identically to PINE / DWALL but walkable,
  // so a hidden grove or vault entrance reads as solid until you push into it.
  FALSEPINE: 12,
  FALSEWALL: 13,
  // Haunted Marsh set (m4, Zone 3): boggy floor, stagnant murk (solid), dead
  // trees (solid), and reed decor.
  MARSH: 14, // wet bog floor (walkable)
  MURK: 15, // stagnant marsh water / quagmire (solid)
  DEADTREE: 16, // twisted dead tree (solid)
  REED: 17, // reeds/cattails decor on the bog (walkable)
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
