import Phaser from 'phaser';
import type { GameData } from '../data/loader.ts';
import type { EnemyData, ZoneData } from '../data/schemas/index.ts';
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
import { walkableMask } from '../systems/mapgen.ts';
import { addRingTexture, addSlashTexture, addTilesetTexture } from '../systems/pixelart.ts';
import { exportSave, importSave } from '../systems/save/codec.ts';
import { defaultSave, type SaveData } from '../systems/save/schema.ts';
import { SaveStore } from '../systems/save/store.ts';
import { parseMapObjects, triggerAt, type EnemyRegion, type MapObjects } from '../systems/triggers.ts';
import { zoneEnemyDefs } from '../systems/zoneSpawns.ts';

declare global {
  interface Window {
    __AZER?: {
      player: Player;
      enemies: () => Enemy[];
      zone: () => string;
      save: { now: () => void; export: () => string; import: (s: string) => void };
    };
  }
}

// Slot 1 is the implicit active slot until a title/load-game menu exists
// (menus arrive with class selection in m1.3 / UI work in m5.2).
const ACTIVE_SLOT = 1;
const AUTOSAVE_MS = 60_000; // roadmap: every 60s; transitions also save (doTransition)

interface ZoneInit {
  zone?: string;
  entryX?: number;
  entryY?: number;
}

interface RegionState {
  region: EnemyRegion;
  timer: number;
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private numbers!: DamageNumbers;
  private slash!: Phaser.GameObjects.Image;
  private fog!: FogOfWar;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private gameData!: GameData;
  private zoneId = 'overworld';
  private zoneDef!: ZoneData;
  private enemyDefs!: EnemyData[];
  private solidMask!: boolean[][];
  private objects!: MapObjects;
  private regionStates: RegionState[] = [];
  private saveStore!: SaveStore;
  private saveData: SaveData = defaultSave();
  private entry: ZoneInit = {};
  private transitioning = false;

  constructor() {
    super('World');
  }

  init(data: ZoneInit): void {
    this.entry = data;
    this.transitioning = false;
    this.regionStates = [];
  }

  create(): void {
    this.gameData = this.registry.get('gameData') as GameData;

    // Save first: it decides the zone, and player level scales enemy spawns.
    this.saveStore = new SaveStore(window.localStorage);
    this.saveData = this.loadSaveSafe();
    this.zoneId = this.entry.zone ?? this.saveData.world.currentZone;
    const zoneDef = this.gameData.zones.find((z) => z.id === this.zoneId);
    if (!zoneDef) throw new Error(`zone "${this.zoneId}" not found in zones.json`);
    this.zoneDef = zoneDef;
    this.enemyDefs = zoneEnemyDefs(this.gameData, this.zoneId);

    addTilesetTexture(this, 'tiles');
    addSlashTexture(this, 'slash');
    addRingTexture(this, 'ring', '#d8503f');

    const map = this.make.tilemap({ key: `map-${this.zoneId}` });
    const tileset = map.addTilesetImage('tiles', 'tiles');
    if (!tileset) throw new Error('failed to add tileset');
    const layer = map.createLayer('ground', tileset, 0, 0);
    if (!layer) throw new Error('failed to create ground layer');
    layer.setCollisionByProperty({ solid: true });
    this.solidMask = layer.layer.data.map((row) =>
      row.map((t) => (t.properties as { solid?: boolean }).solid === true),
    );
    this.objects = parseMapObjects(
      map.getObjectLayer('spawns')?.objects ?? [],
      map.getObjectLayer('triggers')?.objects ?? [],
    );

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    const entryX = this.entry.entryX ?? this.objects.playerSpawn.x;
    const entryY = this.entry.entryY ?? this.objects.playerSpawn.y;
    this.player = new Player(this, entryX, entryY);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, layer);
    this.applySaveToPlayer();

    this.numbers = new DamageNumbers(this);
    this.slash = this.add.image(0, 0, 'slash').setVisible(false).setDepth(8);

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.enemies, layer);
    for (const point of this.objects.enemySpawnPoints) {
      this.enemies.add(new Enemy(this, this.pickFromPool(point.pool), point.x, point.y, this.player.level));
    }
    for (const region of this.objects.enemyRegions) {
      for (let i = 0; i < region.count; i++) this.spawnInRegion(region, 90);
      if (region.respawn) this.regionStates.push({ region, timer: region.respawnInterval });
    }

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard plugin unavailable');
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    kb.on('keydown-R', () => {
      // Prototype: rising again always returns you to the overworld spawn.
      if (this.player.dead) {
        this.player.dead = false;
        this.doTransition({ target: 'overworld' });
      }
    });

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player);
    this.fog = new FogOfWar(this, this.zoneDef.dark, this.player.visionBonus);

    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: () => this.saveNow() });
    this.publishHud();

    window.__AZER = {
      player: this.player,
      enemies: () => this.enemies.getChildren() as Enemy[],
      zone: () => this.zoneId,
      save: {
        now: () => this.saveNow(),
        export: () => exportSave(this.snapshot()),
        import: (s: string) => {
          this.saveData = importSave(s);
          this.saveStore.save(ACTIVE_SLOT, this.saveData);
          this.scene.restart({ zone: this.saveData.world.currentZone });
        },
      },
    };
  }

  override update(_time: number, delta: number): void {
    if (this.transitioning) return;
    const dt = delta / 1000;
    this.player.update();

    if (!this.player.dead) {
      this.player.atkCd = Math.max(0, this.player.atkCd - dt);
      if (this.spaceKey.isDown) this.playerAttack();

      const trigger = triggerAt(this.objects.triggers, this.player.x, this.player.y);
      if (trigger?.kind === 'transition') {
        this.doTransition(trigger);
        return;
      }
      if (trigger?.kind === 'heal') {
        this.player.hp = Math.min(this.player.hp + trigger.rate * dt, this.player.maxHp);
      }
      // 'cutscene' triggers are parsed but inert until the cutscene system (m2.x).
    }

    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active) e.updateEnemy(dt, this.player, this.numbers);
    }
    this.tickRegionRespawns(dt);
    this.publishHud();

    const cam = this.cameras.main;
    this.fog.update(this.player.x - cam.scrollX, this.player.y - cam.scrollY);
  }

  // ---------- zones ----------

  private doTransition(t: { target: string; targetX?: number; targetY?: number }): void {
    this.transitioning = true;
    this.saveData.world.currentZone = t.target;
    if (!this.saveData.world.discoveredZones.includes(t.target)) {
      this.saveData.world.discoveredZones.push(t.target);
    }
    this.saveNow(); // roadmap: autosave on zone transition
    this.scene.restart({ zone: t.target, entryX: t.targetX, entryY: t.targetY } satisfies ZoneInit);
  }

  // ---------- spawning ----------

  private pickFromPool(pool: string[] | null): EnemyData {
    if (!pool) return Phaser.Utils.Array.GetRandom(this.enemyDefs);
    const byId = new Map(this.gameData.enemies.map((e) => [e.id, e]));
    const defs = pool.map((id) => {
      const def = byId.get(id);
      if (!def) throw new Error(`spawn pool references unknown enemy id "${id}"`);
      return def;
    });
    return Phaser.Utils.Array.GetRandom(defs);
  }

  private spawnInRegion(region: EnemyRegion, minPlayerDist: number): boolean {
    for (let tries = 0; tries < 30; tries++) {
      const x = Phaser.Math.Between(region.rect.x, region.rect.x + region.rect.width);
      const y = Phaser.Math.Between(region.rect.y, region.rect.y + region.rect.height);
      if (!walkableMask(this.solidMask, x, y, 6)) continue;
      if (Math.hypot(x - this.player.x, y - this.player.y) <= minPlayerDist) continue;
      this.enemies.add(new Enemy(this, this.pickFromPool(region.pool), x, y, this.player.level));
      return true;
    }
    return false;
  }

  private tickRegionRespawns(dt: number): void {
    for (const state of this.regionStates) {
      state.timer -= dt;
      if (state.timer > 0) continue;
      state.timer = state.region.respawnInterval;
      const alive = (this.enemies.getChildren() as Enemy[]).filter((e) => e.active).length;
      if (alive < state.region.respawnCap) this.spawnInRegion(state.region, 120);
    }
  }

  // ---------- saves ----------

  private loadSaveSafe(): SaveData {
    try {
      return this.saveStore.load(ACTIVE_SLOT) ?? defaultSave();
    } catch (err) {
      // A damaged save must not brick the game: start fresh, keep the
      // corrupt payload untouched in storage for manual rescue.
      console.warn('Ignoring corrupt save in slot', ACTIVE_SLOT, err);
      return defaultSave();
    }
  }

  private applySaveToPlayer(): void {
    this.player.level = this.saveData.character.level;
    this.player.xp = this.saveData.character.xp;
    this.player.gold = this.saveData.character.gold;
    // maxHp derives from level (prototype: 90 + level*10); hp is transient
    // combat state and always restores full on load.
    this.player.maxHp = 90 + this.player.level * 10;
    this.player.hp = this.player.maxHp;
  }

  private snapshot(): SaveData {
    return {
      ...this.saveData,
      updatedAt: Date.now(),
      character: { level: this.player.level, xp: this.player.xp, gold: this.player.gold },
      world: { ...this.saveData.world, currentZone: this.saveData.world.currentZone },
    };
  }

  private saveNow(): void {
    this.saveStore.save(ACTIVE_SLOT, this.snapshot());
  }

  private publishHud(): void {
    this.registry.set('hud', {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      dead: this.player.dead,
    });
  }

  // ---------- combat ----------

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
