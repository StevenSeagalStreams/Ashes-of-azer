// One-shot generator that froze the prototype's procedural layouts into
// authored Tiled JSON maps (assets/maps/*.json). The committed map files are
// the source of truth now — this script is kept only as a regeneration tool
// (deterministic: seeded RNG). Run: node scripts/generate-maps.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TS = 16;
const MAPW = 60;
const MAPH = 40;
// prettier-ignore
const TILE = {
  GRASS: 0, TREE: 1, WATER: 2, PATH: 3, DOOR: 4, DFLOOR: 5, DWALL: 6, PORTAL: 7, FLOWERS: 8,
  FOREST: 9, PINE: 10, MUSHROOM: 11,
};
const TILE_COUNT = 12; // keep in sync with pixelart.ts TILE_COUNT + mapgen.ts TILE
const SOLID = [TILE.TREE, TILE.WATER, TILE.DWALL, TILE.PINE];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Port of the prototype's genOverworld(), seeded for a fixed layout.
function genOverworld(rnd) {
  const m = [];
  for (let y = 0; y < MAPH; y++) {
    const row = [];
    for (let x = 0; x < MAPW; x++) {
      let t = TILE.GRASS;
      if (x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1) t = TILE.TREE;
      else if (rnd() < 0.07) t = TILE.TREE;
      else if (rnd() < 0.04) t = TILE.FLOWERS;
      row.push(t);
    }
    m.push(row);
  }
  for (let y = 4; y < 11; y++)
    for (let x = 42; x < 54; x++) if (Math.hypot(x - 48, y - 7.5) < 5.5) m[y][x] = TILE.WATER;
  for (let x = 8; x < 50; x++) {
    m[30][x] = TILE.PATH;
    m[31][x] = TILE.PATH;
  }
  for (let y = 18; y < 32; y++) {
    m[y][48] = TILE.PATH;
    m[y][49] = TILE.PATH;
  }
  for (let y = 27; y < 35; y++)
    for (let x = 5; x < 15; x++) if (m[y][x] === TILE.TREE) m[y][x] = TILE.GRASS;
  for (let y = 14; y < 20; y++)
    for (let x = 44; x < 54; x++) if (m[y][x] === TILE.TREE) m[y][x] = TILE.GRASS;
  m[15][48] = TILE.DOOR;
  m[15][49] = TILE.DOOR;
  // Town gate (m2.3): a doorway west of the path leading to Ashfall Village.
  for (let y = 24; y < 28; y++) for (let x = 8; x < 13; x++) if (m[y][x] === TILE.TREE) m[y][x] = TILE.GRASS;
  m[26][10] = TILE.DOOR;
  m[26][11] = TILE.DOOR;
  // Forest gate (m2.4): extend the east path to a doorway into the Verdant Reach.
  for (let x = 50; x < 58; x++) {
    m[30][x] = TILE.PATH;
    m[31][x] = TILE.PATH;
  }
  for (let y = 28; y < 34; y++) for (let x = 55; x < 59; x++) if (m[y][x] === TILE.TREE) m[y][x] = TILE.GRASS;
  m[30][57] = TILE.DOOR;
  m[31][57] = TILE.DOOR;
  return m;
}

// The Verdant Reach (m2.4): the Forest Kingdom's wilds — a dark mossy floor,
// dense pines, glades, a pond, and a winding path from the plains gate. ~3× the
// Starter Plains (100×72 = 7200 tiles vs. 60×40 = 2400). Deterministic (seeded).
const FORESTW = 100;
const FORESTH = 72;
function genForest(rnd) {
  const W = FORESTW;
  const H = FORESTH;
  const m = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      let t = TILE.FOREST;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) t = TILE.PINE;
      else if (rnd() < 0.14) t = TILE.PINE;
      else if (rnd() < 0.035) t = TILE.MUSHROOM;
      else if (rnd() < 0.025) t = TILE.FLOWERS;
      row.push(t);
    }
    m.push(row);
  }
  // Open glades (grass clearings) break up the canopy.
  const glade = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (y > 0 && x > 0 && y < H - 1 && x < W - 1 && Math.hypot(x - cx, y - cy) < r) m[y][x] = TILE.GRASS;
  };
  glade(20, 20, 6);
  glade(70, 30, 7);
  glade(50, 56, 6);
  glade(86, 58, 5);
  // A woodland pond.
  for (let y = 10; y < 21; y++) for (let x = 60; x < 75; x++) if (Math.hypot(x - 67, y - 15) < 5) m[y][x] = TILE.WATER;
  // Winding 2-wide main path from the west gate across the Reach.
  const carveH = (y, x1, x2) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      m[y][x] = TILE.PATH;
      m[y + 1][x] = TILE.PATH;
    }
  };
  const carveV = (x, y1, y2) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      m[y][x] = TILE.PATH;
      m[y][x + 1] = TILE.PATH;
    }
  };
  carveH(36, 2, 24);
  carveV(24, 20, 37);
  carveH(20, 24, 50);
  carveV(50, 20, 56);
  carveH(56, 50, 90);
  // West entry pocket + gate back to the plains.
  for (let y = 34; y < 40; y++) for (let x = 1; x < 6; x++) m[y][x] = TILE.FOREST;
  carveH(36, 1, 6);
  m[36][2] = TILE.DOOR;
  m[37][2] = TILE.DOOR;
  // North spur off the main path to the forest hold (Thornhollow).
  for (let y = 4; y < 21; y++) {
    m[y][36] = TILE.PATH;
    m[y][37] = TILE.PATH;
  }
  for (let y = 2; y < 6; y++) for (let x = 34; x < 40; x++) if (m[y][x] === TILE.PINE) m[y][x] = TILE.FOREST;
  m[3][36] = TILE.DOOR;
  m[3][37] = TILE.DOOR;
  return m;
}

// Thornhollow (m2.4): the Forest Kingdom's town — a safe hold in the pines with
// the full slate of services. Same 60×40 town template as Ashfall but on the
// forest floor, ringed by pines, with four service buildings and a well.
function genForestTown(rnd) {
  const m = [];
  for (let y = 0; y < MAPH; y++) {
    const row = [];
    for (let x = 0; x < MAPW; x++) {
      let t = TILE.FOREST;
      if (x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1) t = TILE.PINE;
      else if (rnd() < 0.025) t = TILE.MUSHROOM;
      else if (rnd() < 0.02) t = TILE.FLOWERS;
      row.push(t);
    }
    m.push(row);
  }
  for (let x = 6; x < 54; x++) {
    m[20][x] = TILE.PATH;
    m[21][x] = TILE.PATH;
  }
  for (let y = 6; y < 38; y++) {
    m[y][29] = TILE.PATH;
    m[y][30] = TILE.PATH;
  }
  // Four service buildings (vendor / blacksmith / stash / trainer), door on each front.
  for (const [bx, by] of [[9, 8], [42, 8], [9, 27], [42, 27]]) {
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 7; x++) m[y][x] = TILE.DWALL;
    m[by + 3][bx + 3] = TILE.DOOR;
  }
  m[12][6] = TILE.WATER; // healing well
  m[12][7] = TILE.WATER;
  m[37][29] = TILE.DOOR; // gate back to the Reach
  m[37][30] = TILE.DOOR;
  return m;
}

// Ashfall Village (m2.3): a safe town — grass + a cross of paths, building
// facades (solid stone blocks with a door), a healing well, and a gate home.
function genTown(rnd) {
  const m = [];
  for (let y = 0; y < MAPH; y++) {
    const row = [];
    for (let x = 0; x < MAPW; x++) {
      let t = TILE.GRASS;
      if (x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1) t = TILE.TREE;
      else if (rnd() < 0.03) t = TILE.FLOWERS;
      row.push(t);
    }
    m.push(row);
  }
  for (let x = 6; x < 54; x++) {
    m[20][x] = TILE.PATH;
    m[21][x] = TILE.PATH;
  }
  for (let y = 6; y < 38; y++) {
    m[y][29] = TILE.PATH;
    m[y][30] = TILE.PATH;
  }
  // Six building facades around the plaza; door tile on each front.
  for (const [bx, by] of [[9, 8], [22, 8], [42, 8], [9, 27], [22, 27], [42, 27]]) {
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 7; x++) m[y][x] = TILE.DWALL;
    m[by + 3][bx + 3] = TILE.DOOR;
  }
  m[12][6] = TILE.WATER; // a little well cluster (healing) by the NW building
  m[12][7] = TILE.WATER;
  m[37][29] = TILE.DOOR; // gate back to the plains
  m[37][30] = TILE.DOOR;
  return m;
}

// Port of the prototype's genDungeon() (fully deterministic already).
function genDungeon() {
  const m = [];
  for (let y = 0; y < MAPH; y++) m.push(new Array(MAPW).fill(TILE.DWALL));
  const rooms = [
    [4, 28, 12, 10],
    [20, 26, 10, 8],
    [34, 24, 12, 12],
    [24, 10, 14, 10],
    [6, 8, 12, 8],
    [44, 6, 12, 12],
  ];
  for (const [rx, ry, rw, rh] of rooms)
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) m[y][x] = TILE.DFLOOR;
  const cor = (x1, y1, x2, y2) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      m[y1][x] = TILE.DFLOOR;
      m[y1 + 1][x] = TILE.DFLOOR;
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      m[y][x2] = TILE.DFLOOR;
      m[y][x2 + 1] = TILE.DFLOOR;
    }
  };
  cor(10, 32, 24, 30);
  cor(28, 30, 38, 28);
  cor(30, 28, 30, 15);
  cor(30, 12, 12, 12);
  cor(36, 14, 48, 12);
  m[33][6] = TILE.PORTAL;
  m[33][7] = TILE.PORTAL;
  return m;
}

const prop = (name, type, value) => ({ name, type, value });

function tiledMap({ grid, spawnObjects, triggerObjects }) {
  // Dimensions come from the grid itself, so a zone can be any size (the Forest
  // Kingdom is ~3× the plains) without touching the shared MAPW/MAPH.
  const height = grid.length;
  const width = grid[0].length;
  let nextObjectId = 1;
  const withIds = (objs) => objs.map((o) => ({ visible: true, rotation: 0, ...o, id: nextObjectId++ }));
  const spawns = withIds(spawnObjects);
  const triggers = withIds(triggerObjects);
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width,
    height,
    tilewidth: TS,
    tileheight: TS,
    nextlayerid: 4,
    nextobjectid: nextObjectId,
    layers: [
      {
        id: 1,
        name: 'ground',
        type: 'tilelayer',
        width,
        height,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        data: grid.flat().map((t) => t + 1), // Tiled GIDs are 1-based (firstgid below)
      },
      { id: 2, name: 'spawns', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, objects: spawns },
      { id: 3, name: 'triggers', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, objects: triggers },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        image: 'tiles.png',
        imagewidth: TILE_COUNT * TS,
        imageheight: TS,
        tilewidth: TS,
        tileheight: TS,
        tilecount: TILE_COUNT,
        columns: TILE_COUNT,
        margin: 0,
        spacing: 0,
        tiles: SOLID.map((id) => ({ id, properties: [prop('solid', 'bool', true)] })),
      },
    ],
  };
}

const overworld = tiledMap({
  grid: genOverworld(mulberry32(1337)),
  spawnObjects: [
    { name: 'player', type: 'player_spawn', point: true, x: 10 * TS, y: 31 * TS },
    {
      name: 'field',
      type: 'enemy_region',
      x: TS,
      y: TS,
      width: (MAPW - 2) * TS,
      height: (MAPH - 2) * TS,
      properties: [
        prop('count', 'int', 14),
        prop('respawn', 'bool', true),
        prop('respawnCap', 'int', 10),
        prop('respawnInterval', 'float', 4),
      ],
    },
  ],
  triggerObjects: [
    {
      name: 'barrow-door',
      type: 'transition',
      x: 48 * TS,
      y: 15 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'dungeon'),
        prop('targetX', 'float', 6 * TS + 8),
        prop('targetY', 'float', 31 * TS),
      ],
    },
    {
      name: 'healing-well',
      type: 'heal',
      x: 8 * TS - 20 + 8, // prototype: heals within 20px of tile centre (8,29)
      y: 29 * TS - 20 + 8,
      width: 40,
      height: 40,
      properties: [prop('rate', 'float', 20)],
    },
    {
      name: 'town-gate',
      type: 'transition',
      x: 10 * TS,
      y: 26 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'town'),
        prop('targetX', 'float', 29 * TS + 8),
        prop('targetY', 'float', 34 * TS),
      ],
    },
    {
      name: 'forest-gate',
      type: 'transition',
      x: 57 * TS,
      y: 30 * TS,
      width: TS,
      height: 2 * TS,
      properties: [
        prop('target', 'string', 'forest'),
        prop('targetX', 'float', 4 * TS + 8),
        prop('targetY', 'float', 36 * TS),
      ],
    },
  ],
});

const forest = tiledMap({
  grid: genForest(mulberry32(9001)),
  spawnObjects: [
    { name: 'player', type: 'player_spawn', point: true, x: 4 * TS + 8, y: 36 * TS },
    {
      // Open wilds: one region scatters enemies (from the zone's enemyTypes), as
      // the plains does. Sized up for the ~3× map. No `pool` → zone default.
      name: 'wilds',
      type: 'enemy_region',
      x: TS,
      y: TS,
      width: (FORESTW - 2) * TS,
      height: (FORESTH - 2) * TS,
      properties: [
        prop('count', 'int', 30),
        prop('respawn', 'bool', true),
        prop('respawnCap', 'int', 22),
        prop('respawnInterval', 'float', 4),
      ],
    },
  ],
  triggerObjects: [
    {
      name: 'plains-gate',
      type: 'transition',
      x: 2 * TS,
      y: 36 * TS,
      width: TS,
      height: 2 * TS,
      properties: [
        prop('target', 'string', 'overworld'),
        prop('targetX', 'float', 55 * TS + 8),
        prop('targetY', 'float', 30 * TS + 8),
      ],
    },
    {
      name: 'foresttown-gate',
      type: 'transition',
      x: 36 * TS,
      y: 3 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'foresttown'),
        prop('targetX', 'float', 29 * TS + 8),
        prop('targetY', 'float', 34 * TS),
      ],
    },
  ],
});

const foresttown = tiledMap({
  grid: genForestTown(mulberry32(7777)),
  spawnObjects: [{ name: 'player', type: 'player_spawn', point: true, x: 29 * TS + 8, y: 34 * TS }],
  triggerObjects: [
    {
      name: 'reach-gate',
      type: 'transition',
      x: 29 * TS,
      y: 37 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'forest'),
        prop('targetX', 'float', 36 * TS + 8),
        prop('targetY', 'float', 5 * TS),
      ],
    },
    {
      name: 'town-well',
      type: 'heal',
      x: 6 * TS - 16 + 8,
      y: 12 * TS - 16 + 8,
      width: 40,
      height: 40,
      properties: [prop('rate', 'float', 20)],
    },
  ],
});

const town = tiledMap({
  grid: genTown(mulberry32(4242)),
  spawnObjects: [{ name: 'player', type: 'player_spawn', point: true, x: 29 * TS + 8, y: 34 * TS }],
  triggerObjects: [
    {
      name: 'plains-gate',
      type: 'transition',
      x: 29 * TS,
      y: 37 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'overworld'),
        prop('targetX', 'float', 10 * TS + 8),
        prop('targetY', 'float', 28 * TS),
      ],
    },
    {
      name: 'town-well',
      type: 'heal',
      x: 6 * TS - 16 + 8,
      y: 12 * TS - 16 + 8,
      width: 40,
      height: 40,
      properties: [prop('rate', 'float', 20)],
    },
  ],
});

const DUNGEON_SPOTS = [
  [8, 32],
  [12, 30],
  [24, 29],
  [26, 31],
  [38, 28],
  [40, 30],
  [30, 20],
  [30, 14],
  [26, 13],
  [34, 12],
  [10, 10],
  [14, 12],
];

const dungeon = tiledMap({
  grid: genDungeon(),
  spawnObjects: [
    { name: 'player', type: 'player_spawn', point: true, x: 6 * TS + 8, y: 31 * TS },
    ...DUNGEON_SPOTS.map(([x, y], i) => ({
      name: `mob-${i + 1}`,
      type: 'enemy_spawn',
      point: true,
      x: x * TS,
      y: y * TS,
      properties: [prop('pool', 'string', 'skel,bat')],
    })),
    {
      name: 'rotfang',
      type: 'enemy_spawn',
      point: true,
      x: 50 * TS,
      y: 12 * TS,
      properties: [prop('pool', 'string', 'boss')],
    },
  ],
  triggerObjects: [
    {
      name: 'exit-portal',
      type: 'transition',
      x: 6 * TS,
      y: 33 * TS,
      width: 2 * TS,
      height: TS,
      properties: [
        prop('target', 'string', 'overworld'),
        prop('targetX', 'float', 48.5 * TS),
        prop('targetY', 'float', 17 * TS),
      ],
    },
  ],
});

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'maps');
writeFileSync(join(out, 'overworld.json'), JSON.stringify(overworld));
writeFileSync(join(out, 'dungeon.json'), JSON.stringify(dungeon));
writeFileSync(join(out, 'town.json'), JSON.stringify(town));
writeFileSync(join(out, 'forest.json'), JSON.stringify(forest));
writeFileSync(join(out, 'foresttown.json'), JSON.stringify(foresttown));
console.log('wrote', join(out, 'overworld.json'));
console.log('wrote', join(out, 'dungeon.json'));
console.log('wrote', join(out, 'town.json'));
console.log('wrote', join(out, 'forest.json'));
console.log('wrote', join(out, 'foresttown.json'));
