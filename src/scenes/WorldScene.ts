import Phaser from 'phaser';
import type { GameData } from '../data/loader.ts';
import type { EnemyData, ZoneData } from '../data/schemas/index.ts';
import { Enemy } from '../entities/Enemy.ts';
import { ProjectilePool } from '../entities/Projectile.ts';
import { GroundEffectPool } from '../entities/GroundEffect.ts';
import { TrapPool } from '../entities/Trap.ts';
import { Pet } from '../entities/Pet.ts';
import { Npc } from '../entities/Npc.ts';
import { nodeById, questMarker, visibleChoices, type DialogueContext } from '../systems/dialogue.ts';
import { DialogueUI } from '../ui/DialogueUI.ts';
import { recordEvent, startAvailable, startQuest } from '../systems/quests.ts';
import type { DialogueChoice, DialogueTreeData } from '../data/schemas/index.ts';
import { fanAngles } from '../systems/projectiles.ts';
import { applySkillModsAll, equippedLegendaries, equippedSkillMods } from '../systems/skillMods.ts';
import type { ItemHook, QuestData, QuestObjectiveType } from '../data/schemas/index.ts';
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
  skillsForClass,
  xpToNext,
} from '../systems/skills.ts';
import { parseMapObjects, triggerAt, type EnemyRegion, type MapObjects } from '../systems/triggers.ts';
import { zoneEnemyDefs } from '../systems/zoneSpawns.ts';
import { SkillUI } from '../ui/SkillUI.ts';
import { QuestUI } from '../ui/QuestUI.ts';
import type { SkillData } from '../data/schemas/index.ts';

declare global {
  interface Window {
    __AZER?: {
      player: Player;
      enemies: () => Enemy[];
      zone: () => string;
      save: { now: () => void; export: () => string; import: (s: string) => void };
      // Read-only entity counts for headless smoke tests (and the m2.5 debug tools).
      counts: () => { projectiles: number; traps: number; pet: { hp: number; dead: boolean } | null };
    };
  }
}

// Slot 1 is the active slot. The Title menu (Continue / New Game) selects it;
// multi-slot save management is deferred to the m5.2 UI pass.
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
  // True while the left mouse button is held over the game canvas. Phaser's
  // pointerdown only fires for canvas clicks, so clicks on the DOM skill UI
  // never start an attack; a window-level pointerup catches releases that
  // land outside the canvas so the flag can't stick.
  private attackHeld = false;
  private readonly clearAttackHeld = (): void => {
    this.attackHeld = false;
  };
  private gameData!: GameData;
  // Only the current character's class kit — the hotbar, learnable skills, and
  // the skill panel all draw from this so a Mage never sees Warrior skills.
  private classSkills: SkillData[] = [];
  // classSkills with equipped-item skillMods folded in (m1.5). Casts and
  // tooltips read these so items change how skills behave; learning/ranking
  // still keys off classSkills (mods never change a skill's identity or rank).
  private effectiveSkills: SkillData[] = [];
  // Equipped-legendary triggered effects (m1.5), partitioned by when they fire.
  // `inHook` guards against a hook's own damage re-triggering hooks (no cascades).
  private hooksOnCast: ItemHook[] = [];
  private hooksOnHit: ItemHook[] = [];
  private hooksOnKill: ItemHook[] = [];
  private inHook = false;
  // Brief global freeze on impactful hits (m1.6 hit-stop).
  private hitStopT = 0;
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
  private questUI!: QuestUI;
  private npcs: Npc[] = [];
  private dialogueUI!: DialogueUI;
  private dialogueTree: DialogueTreeData | null = null;
  private dialogueNpc: Npc | null = null;
  private dialogueNodeId = '';
  private projectiles!: ProjectilePool;
  private ground!: GroundEffectPool;
  private traps!: TrapPool;
  // The Hunter's companion (one at a time). null until Summon Pet is cast.
  private pet: Pet | null = null;
  private mapLayer!: Phaser.Tilemaps.TilemapLayer;

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
    this.classSkills = skillsForClass(this.gameData.skills, this.saveData.character.class);
    this.effectiveSkills = this.computeEffectiveSkills();
    this.collectItemHooks();
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
    this.mapLayer = layer;
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
    const combatHooks = {
      enemies: () => (this.enemies.getChildren() as Enemy[]).filter((e) => e.active),
      damage: (e: Enemy, amount: number) => this.dealDamage(e, amount),
    };
    this.projectiles = new ProjectilePool(this, combatHooks);
    this.ground = new GroundEffectPool(this, combatHooks);
    this.traps = new TrapPool(this, combatHooks);

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.enemies, layer);
    for (const point of this.objects.enemySpawnPoints) {
      this.enemies.add(new Enemy(this, this.pickFromPool(point.pool), point.x, point.y, this.player.level));
    }
    for (const region of this.objects.enemyRegions) {
      for (let i = 0; i < region.count; i++) this.spawnInRegion(region, 90);
      if (region.respawn) this.regionStates.push({ region, timer: region.respawnInterval });
    }

    // NPCs standing in this zone (placed data-first in npcs.json).
    this.npcs = this.gameData.npcs
      .filter((n) => n.zone === this.zoneId)
      .map((n) => new Npc(this, n));
    for (const npc of this.npcs) this.physics.add.collider(this.player, npc);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard plugin unavailable');
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    // All-null loadout = never customised → seed the default bar (and persist
    // it so the save carries an explicit choice from then on).
    if (this.saveData.loadout.actives.every((id) => id === null)) {
      this.saveData.loadout.actives = defaultActives(this.classSkills);
      this.saveNow();
    }
    this.hotbar = resolveLoadout(this.saveData.loadout.actives, this.effectiveSkills);
    this.skillCooldowns.clear();
    (['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'] as const).forEach((keyName, i) => {
      kb.on(`keydown-${keyName}`, () => {
        const skill = this.hotbar[i];
        if (skill && !this.player.dead && !this.transitioning) this.castSkill(skill);
      });
    });
    this.events.off('enemy-died');
    this.events.on('enemy-died', (def: EnemyData, x: number, y: number) => this.onEnemyDied(def, x, y));

    this.skillUI = new SkillUI({
      skills: this.effectiveSkills, // tooltips reflect equipped skillMods
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
      passives: () => resolveLoadout(this.saveData.loadout.passives, this.classSkills),
      setPassiveSlot: (slot, skillId) => {
        const skill = skillId ? this.classSkills.find((s) => s.id === skillId) : null;
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
        const skill = skillId ? this.classSkills.find((s) => s.id === skillId) : null;
        if (skill?.mechanic === 'passive') return; // passives go in passive slots, not the hotbar
        this.saveData.loadout.actives = assignSlot(this.saveData.loadout.actives, slot, skillId);
        this.hotbar = resolveLoadout(this.saveData.loadout.actives, this.effectiveSkills);
        this.skillUI.buildHotbar();
        this.saveNow();
      },
    });
    this.questUI = new QuestUI({
      quests: this.gameData.quests,
      state: () => this.saveData.quests,
      setTracked: (id) => {
        this.saveData.quests = { ...this.saveData.quests, tracked: id };
        this.saveNow();
      },
    });
    this.dialogueUI = new DialogueUI({
      onChoice: (choice) => this.onDialogueChoice(choice),
      onClose: () => {
        this.dialogueTree = null;
        this.dialogueNpc = null;
      },
    });
    // Left-click to basic-attack. pointerdown only fires for canvas clicks
    // (DOM skill-UI clicks target their own elements), so the UI is safe.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.attackHeld = true;
    });
    this.input.on('pointerup', this.clearAttackHeld);
    window.addEventListener('pointerup', this.clearAttackHeld);
    this.attackHeld = false;
    this.events.once('shutdown', () => {
      window.removeEventListener('pointerup', this.clearAttackHeld);
      this.skillUI.destroy();
      this.questUI.destroy();
      this.dialogueUI.destroy();
      this.projectiles.destroy();
      this.ground.destroy();
      this.traps.destroy();
      this.pet?.destroyPet();
      this.pet = null;
      for (const npc of this.npcs) npc.destroyNpc();
      this.npcs = [];
    });
    kb.on('keydown-K', () => this.skillUI.togglePanel());
    kb.on('keydown-J', () => this.questUI.togglePanel());
    kb.on('keydown-E', () => this.tryTalk());
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

    // Quests: auto-offer whatever is now available, then fire a "reach" for the
    // zone we just entered (this scene rebuilds per zone, so create() = entry).
    this.offerQuests();
    this.questEvent('reach', this.zoneId);
    this.questUI.refresh();

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
      counts: () => ({
        projectiles: this.projectiles.activeCount(),
        traps: this.traps.activeCount(),
        pet: this.pet ? { hp: this.pet.hp, dead: this.pet.dead } : null,
      }),
    };
  }

  override update(_time: number, delta: number): void {
    if (this.transitioning) return;
    const dt = delta / 1000;
    // Hit-stop: freeze the sim for a few frames on an impactful hit. Tweens
    // (damage numbers, slash) keep playing, so the pop reads during the freeze.
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      return;
    }
    // Conversations freeze the player's own controls (movement/attacks) but
    // leave the rest of the sim running.
    const talking = this.dialogueUI.isOpen();
    if (talking) this.player.setVelocity(0, 0);
    else this.player.update();

    this.player.tickEffects(dt);
    for (const [id, t] of this.skillCooldowns) {
      const left = t - dt;
      if (left <= 0) this.skillCooldowns.delete(id);
      else this.skillCooldowns.set(id, left);
    }

    if (!this.player.dead && !talking) {
      this.player.mp = Math.min(this.player.mp + MANA_REGEN * dt, this.player.maxMp);
      this.player.atkCd = Math.max(0, this.player.atkCd - dt);
      if (this.spaceKey.isDown || this.attackHeld) this.playerAttack();

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
    this.projectiles.update(dt);
    this.ground.update(dt);
    this.traps.update(dt);
    this.pet?.updatePet(dt, this.player);
    if (this.npcs.length) {
      const ctx = this.dialogueContext();
      for (const npc of this.npcs) npc.updateNpc(dt, this.player, questMarker(npc.def.offersQuests, ctx));
    }

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

  /** classSkills with the equipped gear's skillMods folded in (m1.5). */
  private computeEffectiveSkills(): SkillData[] {
    const mods = equippedSkillMods(this.saveData.gear, this.gameData.items.legendaries);
    return applySkillModsAll(this.classSkills, mods);
  }

  /** Buckets the equipped legendaries' triggered effects by when they fire. */
  private collectItemHooks(): void {
    const hooks = equippedLegendaries(this.saveData.gear, this.gameData.items.legendaries).flatMap((l) => l.hooks);
    this.hooksOnCast = hooks.filter((h) => h.on === 'onCast');
    this.hooksOnHit = hooks.filter((h) => h.on === 'onHit');
    this.hooksOnKill = hooks.filter((h) => h.on === 'onKill');
  }

  /**
   * Runs a set of triggered item effects. `inHook` prevents an effect's own
   * damage from re-entering the hook system (so explosions don't chain forever).
   */
  private runHooks(hooks: ItemHook[], x: number, y: number, enemy?: Enemy): void {
    if (hooks.length === 0 || this.inHook) return;
    this.inHook = true;
    for (const h of hooks) {
      switch (h.effect) {
        case 'explode': {
          const r = h.radius ?? 60;
          this.aoeRing(x, y, r, '#e8b64c');
          // Snapshot first: dealDamage can destroy an enemy mid-loop (removing
          // it from the live group), which would otherwise skip the next one.
          const targets = (this.enemies.getChildren() as Enemy[]).filter(
            (e) => e.active && e.hp > 0 && Phaser.Math.Distance.Between(e.x, e.y, x, y) <= r,
          );
          for (const e of targets) this.dealDamage(e, h.value);
          break;
        }
        case 'burn':
          enemy?.applyBurn(h.value, h.duration ?? 3);
          break;
        case 'chill':
          enemy?.applyChill(h.value, h.duration ?? 2);
          break;
        case 'heal':
          this.player.heal(this.player.maxHp * (h.value / 100));
          break;
        case 'manaGain':
          this.player.mp = Math.min(this.player.maxMp, this.player.mp + h.value);
          break;
      }
    }
    this.inHook = false;
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
      this.classSkills,
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
    p.lifestealPct = mods.lifestealPct ?? 0;
    p.thornsPct = mods.thornsPct ?? 0;
    p.blockPct = mods.blockPct ?? 0;
    p.manaOnKill = mods.manaOnKill ?? 0;
    p.damageVsStunnedPct = mods.damageVsStunnedPct ?? 0;
    p.berserkDamagePct = mods.berserkDamagePct ?? 0;
  }

  private snapshot(): SaveData {
    return {
      ...this.saveData,
      updatedAt: Date.now(),
      character: {
        class: this.saveData.character.class,
        level: this.player.level,
        xp: this.player.xp,
        gold: this.player.gold,
      },
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
    const p = this.player;
    const berserk = p.berserkDamagePct > 0 && p.hp < p.maxHp * 0.3 ? p.berserkDamagePct : 0;
    return (
      playerBaseDamage(p.level) *
      (1 + p.damageBuffPct / 100) *
      (1 + p.passiveDamagePct / 100) *
      (1 + berserk / 100)
    );
  }

  private aoeRing(x: number, y: number, radius: number, color: string): void {
    const key = `ring-${color}`;
    addRingTexture(this, key, color);
    const ring = this.add.image(x, y, key).setDepth(7).setScale((radius * 2) / 64);
    this.tweens.add({ targets: ring, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  /** Single path for player→enemy damage: stun bonus, crit, vulnerability, lifesteal. */
  private dealDamage(e: Enemy, baseDamage: number): void {
    let dmg = baseDamage;
    if (e.isStunned && this.player.damageVsStunnedPct > 0) {
      dmg *= 1 + this.player.damageVsStunnedPct / 100;
    }
    const hit = rollHit(dmg, this.player.critPct);
    const dealt = e.takeHit(hit, this.numbers);
    if (e.active) e.knockback(this.player.x, this.player.y, 70); // shove survivors
    // Crits are the "heavy hit": a couple frames of hit-stop + a small shake.
    if (hit.crit) {
      this.hitStopT = Math.max(this.hitStopT, 0.05);
      this.cameras.main.shake(90, 0.006);
    }
    if (this.player.lifestealPct > 0) this.player.heal(dealt * (this.player.lifestealPct / 100));
    if (this.hooksOnHit.length) this.runHooks(this.hooksOnHit, e.x, e.y, e);
  }

  private hitEnemiesWithin(
    x: number,
    y: number,
    radius: number,
    damage: number,
    opts: { stun?: number; bleed?: { dps: number; duration: number } } = {},
  ): void {
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active || Phaser.Math.Distance.Between(e.x, e.y, x, y) >= radius + 6) continue;
      if (opts.stun) e.applyStun(opts.stun);
      if (opts.bleed) e.applyBleed(opts.bleed.dps, opts.bleed.duration);
      this.dealDamage(e, damage);
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
    if (this.hooksOnCast.length) this.runHooks(this.hooksOnCast, this.player.x, this.player.y);

    const p = this.player;
    switch (skill.mechanic) {
      case 'shockwave': {
        const radius = scaleValue(skill.radius, rank);
        const stun = skill.stunDuration ? scaleValue(skill.stunDuration, rank) : undefined;
        const bleed = skill.bleed
          ? { dps: scaleValue(skill.bleed.dps, rank), duration: skill.bleed.duration }
          : undefined;
        this.aoeRing(p.x, p.y, radius, skill.fxColor ?? '#ffffff');
        this.hitEnemiesWithin(p.x, p.y, radius, this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank), {
          stun,
          bleed,
        });
        break;
      }
      case 'generator': {
        const radius = scaleValue(skill.radius, rank);
        this.aoeRing(p.x, p.y, radius, skill.fxColor ?? '#e5e0d0');
        const gain = scaleValue(skill.manaGain, rank);
        let hits = 0;
        for (const e of this.enemies.getChildren() as Enemy[]) {
          if (!e.active || Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) >= radius + 6) continue;
          this.dealDamage(e, this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank));
          hits++;
        }
        // Generators refund mana per enemy struck (net-positive on a crowd).
        p.mp = Math.min(p.maxMp, p.mp + gain * hits);
        break;
      }
      case 'charge': {
        const dist = scaleValue(skill.distance, rank);
        const stun = scaleValue(skill.stunDuration, rank);
        const dmg = this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank);
        // Damage everything in the corridor before dashing to the end.
        for (const e of this.enemies.getChildren() as Enemy[]) {
          if (!e.active) continue;
          const rel = new Phaser.Math.Vector2(e.x - p.x, e.y - p.y);
          const along = rel.x * p.facing.x + rel.y * p.facing.y;
          const perp = Math.abs(rel.x * p.facing.y - rel.y * p.facing.x);
          if (along >= 0 && along <= dist && perp <= 20) {
            e.applyStun(stun);
            this.dealDamage(e, dmg);
          }
        }
        for (let d = dist; d > 0; d -= 6) {
          const nx = p.x + p.facing.x * d;
          const ny = p.y + p.facing.y * d;
          if (walkableMask(this.solidMask, nx, ny, 5)) {
            p.body?.reset(nx, ny);
            break;
          }
        }
        this.aoeRing(p.x, p.y, 30, skill.fxColor ?? '#e8b64c');
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
          { stun: skill.stunDuration },
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
        this.dealDamage(best, this.effectiveDamage() * mult);
        break;
      }
      case 'debuff': {
        const radius = scaleValue(skill.radius, rank);
        const pct = scaleValue(skill.vulnerablePct, rank);
        this.aoeRing(p.x, p.y, radius, skill.fxColor ?? '#c07ef2');
        for (const e of this.enemies.getChildren() as Enemy[]) {
          if (e.active && Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < radius + 6) {
            e.applyVulnerable(pct, skill.duration);
          }
        }
        break;
      }
      case 'heal': {
        p.heal(p.maxHp * (scaleValue(skill.healPct, rank) / 100));
        this.aoeRing(p.x, p.y, 30, skill.fxColor ?? '#8bd06a');
        this.numbers.spawn(p.x, p.y - 12, 'HEAL', '#8bd06a');
        break;
      }
      case 'buff': {
        const dmg = scaleValue(skill.damageBonusPct, rank);
        if (dmg) p.applyDamageBuff(dmg, skill.duration);
        if (skill.damageReductionPct) p.applyDamageReduction(scaleValue(skill.damageReductionPct, rank), skill.duration);
        if (skill.attackSpeedPct) p.applyAttackSpeedBuff(scaleValue(skill.attackSpeedPct, rank), skill.duration);
        this.aoeRing(p.x, p.y, 30, skill.fxColor ?? '#d8503f');
        break;
      }
      case 'projectile': {
        const aim = this.aimDir(); // projectiles fire toward the cursor
        const baseAngle = Math.atan2(aim.y, aim.x);
        // Multi Shot fans `count` bolts at the origin; a plain bolt is count 1.
        const count = skill.count ? Math.max(1, Math.round(scaleValue(skill.count, rank))) : 1;
        const angles = fanAngles(baseAngle, count, skill.spreadArc ?? 0.5);
        const shot = {
          speed: skill.speed,
          radius: skill.radius,
          lifetime: skill.lifetime,
          damage: this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank),
          pierce: skill.pierce ? Math.round(scaleValue(skill.pierce, rank)) : 0,
          chain: skill.chain ? Math.round(scaleValue(skill.chain, rank)) : 0,
          chainRange: skill.chainRange ?? 80,
          split: skill.split ?? 0,
          returns: skill.returns ?? false,
          element: skill.element,
          burn:
            skill.burnDps && skill.burnDuration
              ? { dps: scaleValue(skill.burnDps, rank), duration: skill.burnDuration }
              : undefined,
          chill:
            skill.chillPct && skill.chillDuration
              ? { pct: scaleValue(skill.chillPct, rank), duration: skill.chillDuration }
              : undefined,
          color: 0,
        };
        for (const angle of angles) this.projectiles.fire({ x: p.x, y: p.y, angle, ...shot });
        break;
      }
      case 'groundEffect': {
        // Placed at the cursor (falls back to the player when on top of it).
        const aim = this.aimDir();
        const dist = 60; // cast a fixed distance toward the cursor
        const tx = p.x + aim.x * dist;
        const ty = p.y + aim.y * dist;
        this.ground.spawn({
          x: tx,
          y: ty,
          radius: scaleValue(skill.radius, rank),
          duration: skill.duration,
          tickDps: this.effectiveDamage() * (scaleValue(skill.tickDps, rank) / 10),
          element: skill.element,
          chillPct: skill.chillPct ? scaleValue(skill.chillPct, rank) : undefined,
          burnDps: skill.burnDps ? scaleValue(skill.burnDps, rank) : undefined,
          delay: skill.delay,
          burst: skill.burstMultiplier ? this.effectiveDamage() * scaleValue(skill.burstMultiplier, rank) : undefined,
          color:
            skill.element === 'fire' ? 0xe07830 : skill.element === 'frost' ? 0x7fa8ee : (0x9aa0b0 as number),
        });
        break;
      }
      case 'trap': {
        // Dropped at the Hunter's feet; arms, then detonates on contact.
        this.traps.spawn({
          x: p.x,
          y: p.y,
          radius: scaleValue(skill.radius, rank),
          armTime: skill.armTime,
          lifetime: skill.lifetime,
          damage: this.effectiveDamage() * scaleValue(skill.damageMultiplier, rank),
          element: skill.element,
          stun: skill.stunDuration ? scaleValue(skill.stunDuration, rank) : undefined,
          burn:
            skill.burnDps && skill.burnDuration
              ? { dps: scaleValue(skill.burnDps, rank), duration: skill.burnDuration }
              : undefined,
          chill:
            skill.chillPct && skill.chillDuration
              ? { pct: scaleValue(skill.chillPct, rank), duration: skill.chillDuration }
              : undefined,
          color:
            skill.element === 'fire' ? 0xe07830 : skill.element === 'frost' ? 0x7fa8ee : (0xd0c020 as number),
        });
        break;
      }
      case 'summon': {
        const dmgMult = scaleValue(skill.petDamageMultiplier, rank);
        const cfg = {
          maxHp: Math.round(scaleValue(skill.petHp, rank)),
          damage: () => this.effectiveDamage() * dmgMult,
          attackCooldown: skill.petAttackCooldown,
          speed: skill.petSpeed,
          leashRange: skill.leashRange,
          respawnTime: skill.respawnTime,
        };
        if (this.pet) {
          this.pet.resummon(p, cfg); // re-cast heals + recalls the companion
        } else {
          this.pet = new Pet(this, p.x, p.y, cfg, {
            enemies: () => (this.enemies.getChildren() as Enemy[]).filter((e) => e.active),
            numbers: this.numbers,
          });
          this.physics.add.collider(this.pet, this.mapLayer);
        }
        this.aoeRing(p.x, p.y, 24, skill.fxColor ?? '#6ac06a');
        break;
      }
    }
  }

  private rankUpSkill(skillId: string): void {
    const skill = this.classSkills.find((s) => s.id === skillId);
    if (!skill) return;
    const rank = rankOf(skill, this.saveData.skillRanks);
    const points = availableSkillPoints(this.player.level, this.classSkills, this.saveData.skillRanks);
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

  private onEnemyDied(def: EnemyData, x: number, y: number): void {
    if (this.hooksOnKill.length) this.runHooks(this.hooksOnKill, x, y);
    if (this.player.manaOnKill > 0) {
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + this.player.manaOnKill);
    }
    if (def.boss && !this.saveData.world.killedBosses.includes(def.id)) {
      this.saveData.world.killedBosses.push(def.id);
      this.saveNow();
    }
    this.gainXp(def.xp);
    this.questEvent('kill', def.id);
  }

  /** Awards XP and handles the prototype level-up (full heal/mana, toast). */
  private gainXp(amount: number): void {
    const res = applyXp({ level: this.player.level, xp: this.player.xp }, amount);
    this.player.xp = res.xp;
    if (res.levelsGained > 0) {
      this.player.level = res.level;
      this.recomputeStats();
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.numbers.spawn(this.player.x, this.player.y - 12, `LEVEL ${res.level}!`, '#9bd44a');
      this.aoeRing(this.player.x, this.player.y, 50, '#9bd44a');
    }
    this.saveNow();
  }

  // ---------- quests ----------

  // ---------- dialogue ----------

  /** E near an NPC opens their dialogue (talking also fires a talkTo objective). */
  private tryTalk(): void {
    if (this.dialogueUI.isOpen() || this.player.dead || this.transitioning) return;
    const npc = this.npcs.find((n) => n.inRange(this.player));
    if (!npc) return;
    const tree = this.gameData.dialogue.find((t) => t.id === npc.def.dialogue);
    if (!tree) return;
    this.dialogueNpc = npc;
    this.dialogueTree = tree;
    this.dialogueNodeId = tree.startNodeId;
    this.player.setVelocity(0, 0);
    this.questEvent('talkTo', npc.def.id);
    this.renderDialogueNode();
  }

  private renderDialogueNode(): void {
    const tree = this.dialogueTree;
    const npc = this.dialogueNpc;
    if (!tree || !npc) return;
    const node = nodeById(tree, this.dialogueNodeId);
    if (!node) {
      this.dialogueUI.close();
      return;
    }
    const choices = visibleChoices(node, this.dialogueContext());
    this.dialogueUI.show(npc.def.name, this.portraitFor(npc.def.sprite), node.text, choices);
  }

  private onDialogueChoice(choice: DialogueChoice): void {
    if (choice.action?.setsFlag) {
      this.saveData.world.questFlags[choice.action.setsFlag] = true;
      this.saveNow();
    }
    if (choice.action?.startsQuest) {
      this.saveData.quests = startQuest(this.gameData.quests, this.saveData.quests, choice.action.startsQuest);
      this.saveNow();
      this.questUI.refresh();
    }
    if (choice.nextNodeId) {
      this.dialogueNodeId = choice.nextNodeId;
      this.renderDialogueNode();
    } else {
      this.dialogueUI.close();
    }
  }

  /** Data-URL of an NPC's procedural sprite for the dialogue portrait. */
  private portraitFor(spriteKey: string): string {
    const img = this.textures.get(spriteKey).getSourceImage();
    return img instanceof HTMLCanvasElement ? img.toDataURL() : '';
  }

  /** Snapshot of world state the dialogue engine reads (conditions, markers). */
  private dialogueContext(): DialogueContext {
    return {
      flags: this.saveData.world.questFlags,
      quests: this.saveData.quests,
      catalog: this.gameData.quests,
      corruption: this.saveData.world.corruption,
    };
  }

  /** Auto-offers every quest whose prerequisites are now met. */
  private offerQuests(): void {
    this.saveData.quests = startAvailable(this.gameData.quests, this.saveData.quests);
    this.saveNow();
  }

  /** Feeds a gameplay event to the quest engine, granting rewards on completion. */
  private questEvent(type: QuestObjectiveType, target: string): void {
    const before = this.saveData.quests;
    const r = recordEvent(this.gameData.quests, before, { type, target });
    if (r.state === before) return; // nothing advanced
    this.saveData.quests = r.state;
    for (const q of r.completed) this.grantQuestReward(q);
    if (r.completed.length) this.offerQuests(); // completing one may unlock the next
    this.saveNow();
    this.questUI.refresh();
  }

  private grantQuestReward(quest: QuestData): void {
    this.player.gold += quest.rewards.gold;
    this.numbers.spawn(this.player.x, this.player.y - 22, `✓ ${quest.name}`, '#ffd84a');
    if (quest.rewards.gold) this.numbers.spawn(this.player.x + 18, this.player.y - 12, `+${quest.rewards.gold}g`, '#e8c86a');
    if (quest.rewards.xp) this.gainXp(quest.rewards.xp); // item rewards wait on the loot system
  }

  // ---------- combat ----------

  /**
   * Aim direction for basic attacks: from the player toward the mouse
   * pointer's world position. Falls back to the movement facing when the
   * pointer sits on top of the player (or there's no meaningful cursor).
   */
  private aimDir(): Phaser.Math.Vector2 {
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const v = new Phaser.Math.Vector2(world.x - this.player.x, world.y - this.player.y);
    return v.lengthSq() < 1 ? this.player.facing.clone() : v.normalize();
  }

  private playerAttack(): void {
    if (this.player.atkCd > 0) return;
    this.player.atkCd = attackCooldown(this.player.aspdPct + this.player.aspdBuffPct);
    this.player.lunge();
    const aim = this.aimDir();
    const ax = this.player.x + aim.x * ATTACK_REACH;
    const ay = this.player.y + aim.y * ATTACK_REACH;
    this.slash
      .setPosition(ax, ay)
      .setRotation(Math.atan2(aim.y, aim.x))
      .setVisible(true)
      .setAlpha(1);
    this.tweens.add({ targets: this.slash, alpha: 0, duration: 150 });
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active && Phaser.Math.Distance.Between(e.x, e.y, ax, ay) < ATTACK_RADIUS) {
        this.dealDamage(e, this.effectiveDamage());
      }
    }
  }
}
