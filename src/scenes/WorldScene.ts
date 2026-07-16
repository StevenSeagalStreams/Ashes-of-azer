import Phaser from 'phaser';
import type { GameData } from '../data/loader.ts';
import type { EnemyData } from '../data/schemas/index.ts';
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
import { exportSave, importSave } from '../systems/save/codec.ts';
import { defaultSave, type SaveData } from '../systems/save/schema.ts';
import { SaveStore } from '../systems/save/store.ts';
import { zoneEnemyDefs } from '../systems/zoneSpawns.ts';

declare global {
  interface Window {
    __AZER?: {
      player: Player;
      enemies: () => Enemy[];
      save: { now: () => void; export: () => string; import: (s: string) => void };
    };
  }
}

// Slot 1 is the implicit active slot until a title/load-game menu exists
// (menus arrive with class selection in m1.3 / UI work in m5.2). The store
// itself supports all 3 slots already.
const ACTIVE_SLOT = 1;
const AUTOSAVE_MS = 60_000; // roadmap: autosave every 60s (+ on zone transition, once 0.5 adds transitions)

const ZONE_ID = 'overworld'; // this scene's zone in data/zones.json; multi-zone selection is m0.5's job

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
  private grid!: number[][];
  private enemyDefs!: EnemyData[];
  private respawnTimer = 0;
  private saveStore!: SaveStore;
  // Carries save fields whose owning systems don't exist yet (gear, bag,
  // skill ranks, world flags) through load→autosave untouched, so nothing
  // a future version wrote is ever dropped by this build.
  private savePassThrough: SaveData = defaultSave();
  // Overworld is a bright zone; the dungeon (Milestone 0.5) will pass true.
  private readonly isDarkZone = false;
  // Prototype: refill the overworld toward ~10 enemies every 4s.
  private static readonly OVERWORLD_CAP = 10;
  private static readonly RESPAWN_INTERVAL = 4;

  constructor() {
    super('World');
  }

  create(): void {
    const gameData = this.registry.get('gameData') as GameData;
    this.enemyDefs = zoneEnemyDefs(gameData, ZONE_ID);

    addTilesetTexture(this, 'tiles');
    addSlashTexture(this, 'slash');
    const grid = genOverworld();
    this.grid = grid;
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

    // Load the save BEFORE anything reads player state — enemy hp scales
    // with player level at spawn time, so this must precede populate().
    this.saveStore = new SaveStore(window.localStorage);
    this.loadSave();

    this.numbers = new DamageNumbers(this);
    this.slash = this.add.image(0, 0, 'slash').setVisible(false).setDepth(8);

    // Prototype populate(): 14 enemies on walkable overworld tiles, away from spawn.
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    for (let i = 0; i < 14; i++) {
      const { x, y } = findSpawnPoint(grid);
      const def = Phaser.Utils.Array.GetRandom(this.enemyDefs);
      this.enemies.add(new Enemy(this, def, x, y, this.player.level));
    }
    this.physics.add.collider(this.enemies, layer);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard plugin unavailable');
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    kb.on('keydown-R', () => {
      if (this.player.dead) this.player.respawn(SPAWN.x, SPAWN.y);
    });

    // Prototype: camX = clamp(player.x - W/2, 0, MAPW*TS - W) — a hard follow
    // clamped to the world, which is startFollow + camera bounds in Phaser.
    this.cameras.main.setBounds(0, 0, MAPW * TS, MAPH * TS);
    this.cameras.main.startFollow(this.player);

    this.fog = new FogOfWar(this, this.isDarkZone, this.player.visionBonus);

    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: () => this.saveNow() });

    // UIScene (the HUD overlay) reads these; keeps the two scenes decoupled.
    this.publishHud();

    window.__AZER = {
      player: this.player,
      enemies: () => this.enemies.getChildren() as Enemy[],
      save: {
        now: () => this.saveNow(),
        export: () => exportSave(this.snapshot()),
        import: (s: string) => {
          this.applySave(importSave(s));
          this.saveNow();
        },
      },
    };
  }

  private loadSave(): void {
    try {
      const loaded = this.saveStore.load(ACTIVE_SLOT);
      if (loaded) this.applySave(loaded);
    } catch (err) {
      // A damaged save must not brick the game: start fresh, keep the
      // corrupt payload untouched in storage for manual rescue.
      console.warn('Ignoring corrupt save in slot', ACTIVE_SLOT, err);
    }
  }

  private applySave(save: SaveData): void {
    this.savePassThrough = save;
    this.player.level = save.character.level;
    this.player.xp = save.character.xp;
    this.player.gold = save.character.gold;
    // maxHp derives from level (prototype: 90 + level*10); hp is transient
    // combat state and always restores full on load, like the prototype's
    // respawn.
    this.player.maxHp = 90 + this.player.level * 10;
    this.player.hp = this.player.maxHp;
  }

  private snapshot(): SaveData {
    return {
      ...this.savePassThrough,
      saveVersion: this.savePassThrough.saveVersion,
      updatedAt: Date.now(),
      character: { level: this.player.level, xp: this.player.xp, gold: this.player.gold },
    };
  }

  private saveNow(): void {
    this.saveStore.save(ACTIVE_SLOT, this.snapshot());
  }

  override update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.player.update();

    // Respawn is handled by the keydown-R listener registered in create().
    if (!this.player.dead) {
      this.player.atkCd = Math.max(0, this.player.atkCd - dt);
      if (this.spaceKey.isDown) this.playerAttack();
    }

    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active) e.updateEnemy(dt, this.player, this.numbers);
    }
    this.tickOverworldRespawn(dt);
    this.publishHud();

    // Fog centres on the player's on-screen position (world pos - camera scroll).
    const cam = this.cameras.main;
    this.fog.update(this.player.x - cam.scrollX, this.player.y - cam.scrollY);
  }

  private publishHud(): void {
    this.registry.set('hud', {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      dead: this.player.dead,
    });
  }

  // Prototype: every RESPAWN_INTERVAL seconds, top the overworld back up to
  // OVERWORLD_CAP so the farm never runs dry. New spawns keep clear of the
  // player so nothing pops in on top of them.
  private tickOverworldRespawn(dt: number): void {
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;
    this.respawnTimer = WorldScene.RESPAWN_INTERVAL;
    const alive = (this.enemies.getChildren() as Enemy[]).filter((e) => e.active).length;
    if (alive >= WorldScene.OVERWORLD_CAP) return;
    for (let tries = 0; tries < 20; tries++) {
      const { x, y } = findSpawnPoint(this.grid);
      if (Math.hypot(x - this.player.x, y - this.player.y) > 120) {
        const def = Phaser.Utils.Array.GetRandom(this.enemyDefs);
        // Group members collide with the tile layer via the collider set in create().
        this.enemies.add(new Enemy(this, def, x, y, this.player.level));
        return;
      }
    }
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
