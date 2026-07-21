// GBA-bright procedural pixel art, ported from the prototype's sprite() helper.

import { TILE, TS } from './mapgen.ts';

export const PAL: Record<string, string> = {
  k: '#2b2033',
  w: '#f4f0e0',
  s: '#f2c9a0',
  h: '#7a4a2a',
  r: '#d8503f',
  R: '#f08060',
  b: '#3f6fd0',
  B: '#7fa8ee',
  g: '#4f9c3f',
  G: '#8bd06a',
  y: '#e8b64c',
  o: '#e07830',
  p: '#8b3fd0',
  P: '#c88af5',
  m: '#9aa0b0',
  M: '#cfd4de',
  d: '#57452f',
  D: '#8a6d3b',
  t: '#3e8948',
  q: '#6ee0d8',
  e: '#e5e0d0',
};

export const HERO_ROWS = [
  '...hhhh....',
  '..hhhhhh...',
  '..hsssssh..',
  '..sskssks..',
  '...sssss...',
  '..mMMmMMm..',
  '.yMmmmmmMy.',
  '.sMmmmmmMs.',
  '..mmmmmmm..',
  '..dd...dd..',
  '..kk...kk..',
];

export const SLIME_ROWS = [
  '...GGGG...',
  '..GGGGGG..',
  '.GGkGGkGG.',
  '.GGGGGGGG.',
  'GGGGggGGGG',
  '.gggggggg.',
];

export const BAT_ROWS = [
  'p..pppp..p',
  'ppPPPPPPpp',
  '.pPkPPkPp.',
  '..PPPPPP..',
  '...p..p...',
];

export const SKEL_ROWS = [
  '...wwww...',
  '..wwwwww..',
  '..wkwwkw..',
  '...wwww...',
  '..mwwwwm..',
  '...wwww...',
  '...w..w...',
  '..kk..kk..',
];

export const BOSS_ROWS = [
  '....kkkkkkkk....',
  '..kkrrrrrrrrkk..',
  '.krrRRrrrrRRrrk.',
  '.krRyyRrrRyyRrk.',
  '.krrRRrrrrRRrrk.',
  '..krrrrkkrrrrk..',
  '..krrrrrrrrrrk..',
  '.kdrrrrrrrrrrdk.',
  '.kddrrrrrrrrddk.',
  '..kddddddddddk..',
  '...kdd....ddk...',
  '...kkk....kkk...',
];

// A robed elder/sage NPC (m2.2). Grey hood, brown robe.
export const ELDER_ROWS = [
  '...MMMM...',
  '..MMMMMM..',
  '..MssssM..',
  '..sksks s.',
  '...ssss...',
  '..DDDDDD..',
  '.DDDDDDDD.',
  '.DdDDDDdD.',
  '.DDDDDDDD.',
  '..DD..DD..',
  '..kk..kk..',
];

// A merchant NPC (m2.3): brown hair, tan face, green apron.
export const VENDOR_ROWS = [
  '...hhhh...',
  '..hhhhhh..',
  '..hssssh..',
  '..sksks s.',
  '...ssss...',
  '..tGGGGt..',
  '.tGGGGGGt.',
  '.tGyGGyGt.',
  '.tGGGGGGt.',
  '..GG..GG..',
  '..kk..kk..',
];

// Fallback for a `sprite` key in enemies.json that has no dedicated art
// (e.g. a freshly-added enemy type) — a plain magenta blob, so content
// authors can add a new enemy purely in JSON without the game crashing on
// a missing texture. Real art can follow later.
export const DEFAULT_ENEMY_ROWS = ['.pp.', 'pppp', 'pppp', '.pp.'];

const SPRITE_ROW_SETS: Record<string, string[]> = {
  hero: HERO_ROWS,
  slime: SLIME_ROWS,
  bat: BAT_ROWS,
  skel: SKEL_ROWS,
  boss: BOSS_ROWS,
  elder: ELDER_ROWS,
  vendor: VENDOR_ROWS,
};

export const spriteRowsFor = (key: string): string[] => SPRITE_ROW_SETS[key] ?? DEFAULT_ENEMY_ROWS;

export function addSpriteTexture(scene: Phaser.Scene, key: string, rows: string[]): void {
  if (scene.textures.exists(key)) return;
  const first = rows[0] ?? '';
  const c = document.createElement('canvas');
  c.width = first.length;
  c.height = rows.length;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x] ?? '.'];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  scene.textures.addCanvas(key, c);
}

// 64x64 circle outline; scaled at use-sites for AoE telegraphs (boss slam).
export function addRingTexture(scene: Phaser.Scene, key: string, color: string): void {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.stroke();
  scene.textures.addCanvas(key, c);
}

// Small white arc used as the melee slash flash (prototype fx.slash).
export function addSlashTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(12, 12, 10, -1, 1);
  g.stroke();
  scene.textures.addCanvas(key, c);
}

// One 16px tile per tile id (0-8), laid out left to right in a single strip.
// Tiles drawn into the shared tileset strip, in TILE-id order. Keep in sync with
// the TILE enum (mapgen.ts) and the tileset `tilecount`/`imagewidth` that
// scripts/generate-maps.mjs writes into each map JSON.
export const TILE_COUNT = 12;

export function addTilesetTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = TILE_COUNT * TS;
  c.height = TS;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');

  const base = (id: number, color: string): void => {
    g.fillStyle = color;
    g.fillRect(id * TS, 0, TS, TS);
  };

  base(TILE.GRASS, '#8bd06a');
  g.fillStyle = '#7cc25c';
  g.fillRect(TILE.GRASS * TS + 4, 6, 2, 2);
  g.fillRect(TILE.GRASS * TS + 10, 11, 2, 2);

  base(TILE.TREE, '#8bd06a');
  g.fillStyle = '#57452f';
  g.fillRect(TILE.TREE * TS + 6, 9, 4, 6);
  g.fillStyle = '#3e8948';
  g.beginPath();
  g.arc(TILE.TREE * TS + 8, 6, 7, 0, 7);
  g.fill();
  g.fillStyle = '#4fa858';
  g.beginPath();
  g.arc(TILE.TREE * TS + 5, 4, 4, 0, 7);
  g.fill();

  base(TILE.WATER, '#5ab4e8');
  g.fillStyle = '#4aa4d9';
  g.fillRect(TILE.WATER * TS, 0, 8, 8);
  g.fillRect(TILE.WATER * TS + 8, 8, 8, 8);

  base(TILE.PATH, '#d8b76a');

  base(TILE.DOOR, '#8bd06a');
  g.fillStyle = '#241a30';
  g.fillRect(TILE.DOOR * TS + 2, 2, TS - 4, TS - 2);
  g.fillStyle = '#57452f';
  g.fillRect(TILE.DOOR * TS, 0, TS, 3);

  base(TILE.DFLOOR, '#7a6a8e');
  g.fillStyle = '#746387';
  g.fillRect(TILE.DFLOOR * TS, 0, 8, 8);
  g.fillRect(TILE.DFLOOR * TS + 8, 8, 8, 8);

  base(TILE.DWALL, '#3a2d4a');

  base(TILE.PORTAL, '#7a6a8e');
  g.fillStyle = '#6ee0d8';
  g.beginPath();
  g.arc(TILE.PORTAL * TS + 8, 8, 6, 0, 7);
  g.fill();
  g.fillStyle = '#b8f8f2';
  g.beginPath();
  g.arc(TILE.PORTAL * TS + 8, 8, 3, 0, 7);
  g.fill();

  base(TILE.FLOWERS, '#8bd06a');
  g.fillStyle = '#f2d048';
  g.fillRect(TILE.FLOWERS * TS + 6, 6, 3, 3);
  g.fillStyle = '#7cc25c';
  g.fillRect(TILE.FLOWERS * TS + 7, 9, 1, 4);

  // ---- Forest Kingdom tiles (m2.4) ----
  // Forest floor: a darker, mossier grass so the whole zone reads distinctly.
  base(TILE.FOREST, '#4f9d54');
  g.fillStyle = '#468e4b';
  g.fillRect(TILE.FOREST * TS + 3, 5, 2, 2);
  g.fillRect(TILE.FOREST * TS + 11, 10, 2, 2);
  g.fillStyle = '#57a85c';
  g.fillRect(TILE.FOREST * TS + 8, 3, 1, 2);

  // Pine: a tall dark conifer over forest floor (solid).
  base(TILE.PINE, '#4f9d54');
  g.fillStyle = '#4a3320';
  g.fillRect(TILE.PINE * TS + 7, 12, 2, 4); // trunk
  g.fillStyle = '#1f5b30';
  g.beginPath();
  g.moveTo(TILE.PINE * TS + 8, 0);
  g.lineTo(TILE.PINE * TS + 14, 13);
  g.lineTo(TILE.PINE * TS + 2, 13);
  g.closePath();
  g.fill();
  g.fillStyle = '#2c7a41';
  g.beginPath();
  g.moveTo(TILE.PINE * TS + 8, 2);
  g.lineTo(TILE.PINE * TS + 12, 9);
  g.lineTo(TILE.PINE * TS + 4, 9);
  g.closePath();
  g.fill();

  // Mushroom decor on the forest floor (walkable).
  base(TILE.MUSHROOM, '#4f9d54');
  g.fillStyle = '#e8e0c8';
  g.fillRect(TILE.MUSHROOM * TS + 7, 9, 2, 4); // stalk
  g.fillStyle = '#c8402f';
  g.beginPath();
  g.arc(TILE.MUSHROOM * TS + 8, 8, 4, Math.PI, 0);
  g.fill();
  g.fillStyle = '#f2d0c0';
  g.fillRect(TILE.MUSHROOM * TS + 6, 7, 1, 1);
  g.fillRect(TILE.MUSHROOM * TS + 9, 6, 1, 1);

  scene.textures.addCanvas(key, c);
}
