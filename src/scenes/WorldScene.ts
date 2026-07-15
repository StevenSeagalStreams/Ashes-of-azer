import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy.ts';
import { Player } from '../entities/Player.ts';
import {
  ATTACK_RADIUS,
  ATTACK_REACH,
  attackCooldown,
  playerBaseDamage,
  rollHit,
} from '../systems/combat.ts';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { FogOfWar } from '../systems/fog.ts';
import { genOverworld, MAPH, MAPW, SOLID_TILES, SPAWN, TS, walkable } from '../systems/mapgen.ts';
import { addSlashTexture, addTilesetTexture } from '../systems/pixelart.ts';

declare global {
  interface Window {
    __AZER?: { player: Player; enemies: () => Enemy[] };
  }
}

// Prototype populate(): random walkable overworld tile at least 90px from spawn.
function findSpawnPoint(grid: number[][]): { x: number; y: number } {
  for (;;) {
    const x = Phaser.Math.Between(3, MAPW - 3) * TS;
    const y = Phaser.Math.Between(3, MAPH - 3) * TS;
    if (walkable(grid, x, y, 6) && Math.hypot(x - SPAWN.x, y - SPAWN.y) > 90) return { x, y };
  }
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private numbers!: DamageNumbers;
  private slash!: Phaser.GameObjects.Image;
  private fog!: FogOfWar;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  // Overworld is a bright zone; the dungeon (Milestone 0.5) will pass true.
  private readonly isDarkZone = false;

  constructor() {
    super('World');
  }

  create(): void {
    addTilesetTexture(this, 'tiles');
    addSlashTexture(this, 'slash');
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

    this.numbers = new DamageNumbers(this);
    this.slash = this.add.image(0, 0, 'slash').setVisible(false).setDepth(8);

    // Prototype populate(): 14 slimes/bats on walkable overworld tiles, away from spawn.
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    for (let i = 0; i < 14; i++) {
      const { x, y } = findSpawnPoint(grid);
      const type = Math.random() < 0.7 ? 'slime' : 'bat';
      this.enemies.add(new Enemy(this, type, x, y, this.player.level));
    }
    this.physics.add.collider(this.enemies, layer);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard plugin unavailable');
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Prototype: camX = clamp(player.x - W/2, 0, MAPW*TS - W) — a hard follow
    // clamped to the world, which is startFollow + camera bounds in Phaser.
    this.cameras.main.setBounds(0, 0, MAPW * TS, MAPH * TS);
    this.cameras.main.startFollow(this.player);

    this.fog = new FogOfWar(this, this.isDarkZone, this.player.visionBonus);

    window.__AZER = {
      player: this.player,
      enemies: () => this.enemies.getChildren() as Enemy[],
    };
  }

  override update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.player.update();
    this.player.atkCd = Math.max(0, this.player.atkCd - dt);
    if (this.spaceKey.isDown) this.playerAttack();
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active) e.updateEnemy(dt, this.player, this.numbers);
    }
    // Fog centres on the player's on-screen position (world pos - camera scroll).
    const cam = this.cameras.main;
    this.fog.update(this.player.x - cam.scrollX, this.player.y - cam.scrollY);
  }

  private playerAttack(): void {
    if (this.player.atkCd > 0) return;
    this.player.atkCd = attackCooldown(this.player.aspdPct);
    const ax = this.player.x + this.player.facing.x * ATTACK_REACH;
    const ay = this.player.y + this.player.facing.y * ATTACK_REACH;
    this.slash
      .setPosition(ax, ay)
      .setRotation(Math.atan2(this.player.facing.y, this.player.facing.x))
      .setVisible(true)
      .setAlpha(1);
    this.tweens.add({ targets: this.slash, alpha: 0, duration: 150 });
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active && Phaser.Math.Distance.Between(e.x, e.y, ax, ay) < ATTACK_RADIUS) {
        e.takeHit(rollHit(playerBaseDamage(this.player.level), this.player.critPct), this.numbers);
      }
    }
  }
}
