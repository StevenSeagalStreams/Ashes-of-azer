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
import {
  applyXp,
  assignSlot,
  passiveModifiers,
  availableSkillPoints,
  castBlock,
  defaultActives,
  MANA_REGEN,
  manaMaxFor,
  rankOf,
  resolveLoadout,
  scaleValue,
  skillCooldown,
  xpToNext,
} from '../systems/skills.ts';
import { parseMapObjects, triggerAt, type EnemyRegion, type MapObjects } from '../systems/triggers.ts';
import { zoneEnemyDefs } from '../systems/zoneSpawns.ts';
import { SkillUI } from '../ui/SkillUI.ts';
import type { SkillData } from '../data/schemas/index.ts';

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
  // Hotbar: keys 1-6 cast these skills. Until the loadout UI sub-task lands,
  // the first 6 skills in skills.json order fill the slots (matches the
  // prototype's fixed 1-5 binding).
  private hotbar: (SkillData | null)[] = [];
  private readonly skillCooldowns = new Map<string, number>();
  private skillUI!: SkillUI;

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
    // All-null loadout = never customised → seed the default bar (and persist
    // it so the save carries an explicit choice from then on).
    if (this.saveData.loadout.actives.every((id) => id === null)) {
      this.saveData.loadout.actives = defaultActives(this.gameData.skills);
    }
    this.hotbar = resolveLoadout(this.saveData.loadout.actives, this.gameData.skills);
    this.skillCooldowns.clear();
    (['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'] as const).forEach((keyName, i) => {
      kb.on(`keydown-${keyName}`, () => {
        const skill = this.hotbar[i];
        if (skill && !this.player.dead && !this.transitioning) this.castSkill(skill);
      });
    });
    this.events.off('enemy-died');
    this.events.on('enemy-died', (def: EnemyData) => this.onEnemyDied(def));

    this.skillUI = new SkillUI({
      skills: this.gameData.skills,
      hotbar: () => this.hotbar,
      level: () => this.player.level,
      skillRanks: () => this.saveData.skillRanks,
      slotState: (skill) => {
        const cooldownRemaining = this.skillCooldowns.get(skill.id) ?? 0;
        return {
          cooldownRemaining,
          block: castBlock(skill, {
            level: this.player.level,
            rank: rankOf(skill, this.saveData.skillRanks),
            mp: this.player.mp,
            cooldownRemaining,
          }),
        };
      },
      rankUp: (skillId) => this.rankUpSkill(skillId),
      passives: () => resolveLoadout(this.saveData.loadout.passives, this.gameData.skills),
      setPassiveSlot: (slot, skillId) => {
        const skill = skillId ? this.gameData.skills.find((s) => s.id === skillId) : null;
        if (skillId !== null && skill?.mechanic !== 'passive') return; // only passives here
        this.saveData.loadout.passives = assignSlot(this.saveData.loadout.passives, slot, skillId);
        this.recomputeStats();
        this.skillUI.buildPassiveBar();
        this.saveNow();
      },
      respec: () => {
        // Free skill-point reset; its "town trainer" home arrives in m2.3.
        this.saveData.skillRanks = {};
        this.saveData.loadout.passives = [null, null, null, null, null, null];
        this.recomputeStats();
        this.saveNow();
      },
      setSlot: (slot, skillId) => {
        const skill = skillId ? this.gameData.skills.find((s) => s.id === skillId) : null;
        if (skill?.mechanic === 'passive') return; // passives go in passive slots, not the hotbar
        this.saveData.loadout.actives = assignSlot(this.saveData.loadout.actives, slot, skillId);
        this.hotbar = resolveLoadout(this.saveData.loadout.actives, this.gameData.skills);
        this.skillUI.buildHotbar();
        this.saveNow();
      },
    });
    this.events.once('shutdown', () => this.skillUI.destroy());
    kb.on('keydown-K', () => this.skillUI.togglePanel());
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

    this.player.tickEffects(dt);
    for (const [id, t] of this.skillCooldowns) {
      const left = t - dt;
      if (left <= 0) this.skillCooldowns.delete(id);
      else this.skillCooldowns.set(id, left);
    }

    if (!this.player.dead) {
      this.player.mp = Math.min(this.player.mp + MANA_REGEN * dt, this.player.maxMp);
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
    this.skillUI.refresh();

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
    this.recomputeStats();
    // hp/mp are transient combat state and always restore full on load.
    this.player.hp = this.player.maxHp;
    this.player.mp = this.player.maxMp;
  }

  /** Derived stats = level base × slotted-passive modifiers. */
  private recomputeStats(): void {
    const mods = passiveModifiers(
      this.gameData.skills,
      this.saveData.skillRanks,
      this.saveData.loadout.passives,
    );
    const p = this.player;
    const hpFrac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = Math.round((90 + p.level * 10) * (1 + (mods.maxHpPct ?? 0) / 100));
    p.hp = Math.min(p.maxHp, Math.max(1, Math.round(p.maxHp * hpFrac)));
    p.maxMp = manaMaxFor(p.level);
    p.mp = Math.min(p.mp, p.maxMp);
    p.critPct = 5 + (mods.critPct ?? 0);
    p.moveSpeedPct = mods.moveSpeedPct ?? 0;
    p.aspdPct = mods.aspdPct ?? 0;
    p.cdrPct = mods.cdrPct ?? 0;
    p.passiveDamagePct = mods.damagePct ?? 0;
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
      mp: this.player.mp,
      maxMp: this.player.maxMp,
      xp: this.player.xp,
      xpNext: xpToNext(this.player.level),
      level: this.player.level,
      dead: this.player.dead,
    });
  }

  // ---------- skills & xp ----------

  private effectiveDamage(): number {
    return (
      playerBaseDamage(this.player.level) *
      (1 + this.player.damageBuffPct / 100) *
      (1 + this.player.passiveDamagePct / 100)
    );
  }

  private aoeRing(x: number, y: number, radius: number, color: string): void {
    const key = `ring-${color}`;
    addRingTexture(this, key, color);
    const ring = this.add.image(x, y, key).setDepth(7).setScale((radius * 2) / 64);
    this.tweens.add({ targets: ring, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  private hitEnemiesWithin(x: number, y: number, radius: number, damage: number, stun?: number): void {
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active || Phaser.Math.Distance.Between(e.x, e.y, x, y) >= radius + 6) continue;
      if (stun) e.applyStun(stun);
      e.takeHit(rollHit(damage, this.player.critPct), this.numbers);
    }
  }

  private castSkill(skill: SkillData): void {
    if (skill.mechanic === 'passive') return; // passives are never cast
    const rank = rankOf(skill, this.saveData.skillRanks);
    const block = castBlock(skill, {
      level: this.player.level,
      rank,
      mp: this.player.mp,
      cooldownRemaining: this.skillCooldowns.get(skill.id) ?? 0,
    });
    if (block) return;
    this.player.mp -= skill.manaCost;
    this.skillCooldowns.set(skill.id, skillCooldown(skill.cooldown, this.player.cdrPct));

    const p = this.player;
    switch (skill.mechanic) {
      case 'shockwave': {
        const radius = scaleValue(skill.radius, rank);
        const stun = skill.stunDuration ? scaleValue(skill.stunDuration, rank) : undefined;
        this.aoeRing(p.x, p.y, radius, skill.fxColor ?? '#ffffff');
        this.hitEnemiesWithin(p.x, p.y, radius, this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank), stun);
        break;
      }
      case 'leap': {
        // Prototype: try the farthest walkable landing point along facing.
        for (let d = scaleValue(skill.distance, rank); d > 0; d -= 6) {
          const nx = p.x + p.facing.x * d;
          const ny = p.y + p.facing.y * d;
          if (walkableMask(this.solidMask, nx, ny, 5)) {
            p.body?.reset(nx, ny);
            break;
          }
        }
        this.aoeRing(p.x, p.y, skill.landingRadius, skill.fxColor ?? '#ffffff');
        this.hitEnemiesWithin(
          p.x,
          p.y,
          skill.landingRadius,
          this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank),
          skill.stunDuration,
        );
        break;
      }
      case 'execute': {
        let best: Enemy | null = null;
        let bestD = skill.range;
        for (const e of this.enemies.getChildren() as Enemy[]) {
          if (!e.active) continue;
          const d = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (!best) {
          // Prototype: no target refunds the mana, tiny 0.3s cooldown.
          p.mp += skill.manaCost;
          this.skillCooldowns.set(skill.id, 0.3);
          return;
        }
        const low = (best.hp / best.maxHp) * 100 < scaleValue(skill.lifeThresholdPct, rank);
        const mult = low ? scaleValue(skill.damageMultiplierLow, rank) : skill.damageMultiplierHigh;
        best.takeHit(rollHit(this.effectiveDamage() * mult, p.critPct), this.numbers);
        break;
      }
      case 'buff': {
        p.applyDamageBuff(scaleValue(skill.damageBonusPct, rank), skill.duration);
        this.aoeRing(p.x, p.y, 30, skill.fxColor ?? '#d8503f');
        break;
      }
    }
  }

  private rankUpSkill(skillId: string): void {
    const skill = this.gameData.skills.find((s) => s.id === skillId);
    if (!skill) return;
    const rank = rankOf(skill, this.saveData.skillRanks);
    const points = availableSkillPoints(this.player.level, this.gameData.skills, this.saveData.skillRanks);
    if (points <= 0 || rank >= skill.maxRank || this.player.level < skill.unlockLevel) return;
    this.saveData.skillRanks[skill.id] = rank + 1;
    if (skill.mechanic === 'passive') {
      // Newly learned passives self-slot into the first empty passive slot.
      const slots = this.saveData.loadout.passives;
      if (rank === 0 && !slots.includes(skill.id)) {
        const empty = slots.indexOf(null);
        if (empty >= 0) slots[empty] = skill.id;
      }
      this.recomputeStats();
      this.skillUI.buildPassiveBar();
    }
    this.saveNow();
  }

  private onEnemyDied(def: EnemyData): void {
    if (def.boss && !this.saveData.world.killedBosses.includes(def.id)) {
      this.saveData.world.killedBosses.push(def.id);
      this.saveNow();
    }
    const res = applyXp({ level: this.player.level, xp: this.player.xp }, def.xp);
    this.player.xp = res.xp;
    if (res.levelsGained > 0) {
      this.player.level = res.level;
      // Prototype level-up: stats refresh, full heal, full mana.
      this.recomputeStats();
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.numbers.spawn(this.player.x, this.player.y - 12, `LEVEL ${res.level}!`, '#9bd44a');
      this.aoeRing(this.player.x, this.player.y, 50, '#9bd44a');
      this.saveNow();
    }
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
        e.takeHit(rollHit(this.effectiveDamage(), this.player.critPct), this.numbers);
      }
    }
  }
}
