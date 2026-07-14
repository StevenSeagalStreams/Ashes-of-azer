import Phaser from 'phaser';
import { Player } from '../entities/Player.ts';
import { genOverworld, MAPH, MAPW, SOLID_TILES, SPAWN, TS } from '../systems/mapgen.ts';
import { addTilesetTexture } from '../systems/pixelart.ts';

declare global {
  interface Window {
    __AZER?: { player: Player };
  }
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;

  constructor() {
    super('World');
  }

  create(): void {
    addTilesetTexture(this, 'tiles');
    const grid = genOverworld();
    const map = this.make.tilemap({ data: grid, tileWidth: TS, tileHeight: TS });
    const tileset = map.addTilesetImage('tiles');
    if (!tileset) throw new Error('failed to add tileset');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('failed to create tile layer');
    layer.setCollision(SOLID_TILES);

    this.physics.world.setBounds(0, 0, MAPW * TS, MAPH * TS);
    this.player = new Player(this, SPAWN.x, SPAWN.y);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, layer);

    // Prototype: camX = clamp(player.x - W/2, 0, MAPW*TS - W) — a hard follow
    // clamped to the world, which is startFollow + camera bounds in Phaser.
    this.cameras.main.setBounds(0, 0, MAPW * TS, MAPH * TS);
    this.cameras.main.startFollow(this.player);

    window.__AZER = { player: this.player };
  }

  override update(): void {
    this.player.update();
  }
}
