import Phaser from 'phaser';
import type { GameData } from '../data/loader.ts';
import type { EnemyData, ZoneData } from '../data/schemas/index.ts';
import { Enemy } from '../entities/Enemy.ts';
import { ProjectilePool } from '../entities/Projectile.ts';
import { EnemyProjectilePool, type EnemyShot } from '../entities/EnemyProjectile.ts';
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
import { gearStats, itemValue, repairCost, rollItem, rollVendorStock, sellValue } from '../systems/loot.ts';
import type { ItemInstance } from '../systems/save/schema.ts';
import { ShopUI } from '../ui/ShopUI.ts';
import { StashUI } from '../ui/StashUI.ts';
import { RepairUI, type CraftEntry, type MaterialStock, type RepairEntry } from '../ui/RepairUI.ts';
import { canCraft, craftItem, pickMaterial, spendInputs } from '../systems/crafting.ts';
import { addRep, factionForZone, repProgress, repTier } from '../systems/factions.ts';
import { cleanseCorruption, corruptedEnemy, corruptionTier, gainCorruption } from '../systems/corruption.ts';
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
import { parseMapObjects, triggerAt, type EnemyRegion, type MapObjects, type SecretTrigger, type WorldBossSpawn } from '../systems/triggers.ts';
import { zoneEnemyDefs } from '../systems/zoneSpawns.ts';
import { SkillUI } from '../ui/SkillUI.ts';
import { QuestUI } from '../ui/QuestUI.ts';
import { InventoryUI } from '../ui/InventoryUI.ts';
import type { ItemSlot, SkillData } from '../data/schemas/index.ts';

declare global {
  interface Window {
    __AZER?: {
      player: Player;
      enemies: () => Enemy[];
      spawn: (id: string, x: number, y: number) => boolean;
      zone: () => string;
      save: { now: () => void; export: () => string; import: (s: string) => void };
      // Read-only entity counts for headless smoke tests (and the m2.5 debug tools).
      counts: () => {
        projectiles: number;
        enemyShots: number;
        enemies: number;
        traps: number;
        pet: { hp: number; dead: boolean } | null;
        drops: number;
        bag: number;
      };
      // Dev-only debug tools (m2.5). Console-only — no player-facing UI, so it
      // stays out of the way in normal play but powers headless smokes + dev use.
      debug: {
        teleport: (zone: string, x?: number, y?: number) => void;
        spawnItem: (slot?: string, rarity?: string) => string;
        spawnEnemy: (id: string, x?: number, y?: number) => boolean;
        setCorruption: (n: number) => number;
        godMode: (on?: boolean) => boolean;
      };
    };
  }
}

// Slot 1 is the active slot. The Title menu (Continue / New Game) selects it;
// multi-slot save management is deferred to the m5.2 UI pass.
const ACTIVE_SLOT = 1;
const AUTOSAVE_MS = 60_000; // roadmap: every 60s; transitions also save (doTransition)

// Loot loop (m1.7): rarity → drop-gem colour; how often normal enemies drop;
// how close the player collects from.
const RARITY_COLOR: Record<string, number> = {
  white: 0xf4f0e0,
  magic: 0x7fa8ee,
  rare: 0xe8b64c,
  epic: 0xc88af5,
  legendary: 0xe07830,
};
const NORMAL_DROP_CHANCE = 0.4;
// Crafting materials drop independently of gear (m2.3), a bit less often.
const MATERIAL_DROP_CHANCE = 0.3;
const PICKUP_RANGE = 16;

// A pickup lying on the ground: either a gear item (→ bag) or a stack of one
// crafting material (→ materials). `gfx` is the bobbing marker for both.
type Drop =
  | { kind: 'item'; item: ItemInstance; gfx: Phaser.GameObjects.Rectangle }
  | { kind: 'material'; material: string; name: string; color: number; gfx: Phaser.GameObjects.Rectangle };

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
  // Corruption ambience (m3 visual layer): a screen tint + falling ash/embers.
  private corruptionOverlay!: Phaser.GameObjects.Rectangle;
  private corruptionEmber!: Phaser.GameObjects.Particles.ParticleEmitter;
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
  // Open-world bosses (m2.4): each spawns on zone load and, once slain, returns
  // after its `respawn` seconds while you remain in the zone.
  private worldBossStates: { spawn: WorldBossSpawn; eid: number | null; timer: number }[] = [];
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
  private inventoryUI!: InventoryUI;
  private shopUI!: ShopUI;
  private stashUI!: StashUI;
  private repairUI!: RepairUI;
  private attackWearCounter = 0; // gear wears every couple of swings
  private debugGod = false; // dev god-mode, re-applied to the fresh Player each zone
  // The current vendor's stock (in-memory; re-rolls on zone load + level-up).
  private vendorStock: ItemInstance[] = [];
  // Faction of the vendor currently being talked to (drives stock size + rep note).
  private activeVendorFaction: string | null = null;
  private dialogueUI!: DialogueUI;
  private dialogueTree: DialogueTreeData | null = null;
  private dialogueNpc: Npc | null = null;
  private dialogueNodeId = '';
  private projectiles!: ProjectilePool;
  private enemyShots!: EnemyProjectilePool;
  private ground!: GroundEffectPool;
  private traps!: TrapPool;
  // The Hunter's companion (one at a time). null until Summon Pet is cast.
  private pet: Pet | null = null;
  private mapLayer!: Phaser.Tilemaps.TilemapLayer;
  // Item drops lying on the ground, collected by walking over them (m1.7).
  private drops: Drop[] = [];
  // Glimmer markers over undiscovered secret pickups (m2.4), keyed by secret id.
  private secretMarkers = new Map<string, Phaser.GameObjects.GameObject>();

  constructor() {
    super('World');
  }

  init(data: ZoneInit): void {
    this.entry = data;
    this.transitioning = false;
    this.regionStates = [];
    this.worldBossStates = [];
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
    this.player.invulnerable = this.debugGod; // carry dev god-mode across zones

    this.numbers = new DamageNumbers(this);
    this.slash = this.add.image(0, 0, 'slash').setVisible(false).setDepth(8);
    const combatHooks = {
      enemies: () => (this.enemies.getChildren() as Enemy[]).filter((e) => e.active),
      damage: (e: Enemy, amount: number) => this.dealDamage(e, amount),
    };
    this.projectiles = new ProjectilePool(this, combatHooks);
    this.ground = new GroundEffectPool(this, combatHooks);
    this.traps = new TrapPool(this, combatHooks);
    this.enemyShots = new EnemyProjectilePool(this, {
      playerPos: () => (this.player.dead ? null : { x: this.player.x, y: this.player.y }),
      hit: (amount) => this.player.takeDamage(amount, this.numbers),
    });

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.enemies, layer);
    for (const point of this.objects.enemySpawnPoints) {
      this.makeEnemy(this.pickFromPool(point.pool), point.x, point.y);
    }
    for (const region of this.objects.enemyRegions) {
      for (let i = 0; i < region.count; i++) this.spawnInRegion(region, 90);
      if (region.respawn) this.regionStates.push({ region, timer: region.respawnInterval });
    }
    for (const spawn of this.objects.worldBosses) {
      const eid = this.spawnWorldBoss(spawn);
      this.worldBossStates.push({ spawn, eid, timer: spawn.respawn });
    }
    // A glimmer marks each not-yet-found secret pickup (visible only once you've
    // pushed through the false wall hiding it).
    this.secretMarkers.clear();
    for (const t of this.objects.triggers) {
      if (t.kind !== 'secret' || this.saveData.secrets.includes(t.secretId)) continue;
      const cx = t.rect.x + t.rect.width / 2;
      const cy = t.rect.y + t.rect.height / 2;
      const star = this.add.star(cx, cy, 5, 3, 6, 0x6ee0d8).setDepth(4).setStrokeStyle(1, 0xffffff, 0.8);
      this.tweens.add({ targets: star, scale: 1.4, angle: 180, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      this.secretMarkers.set(t.secretId, star);
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
    this.events.off('enemy-shoot');
    this.events.on('enemy-shoot', (shot: EnemyShot) => this.enemyShots.fire(shot));
    this.events.off('enemy-summon');
    this.events.on('enemy-summon', (cfg: NonNullable<EnemyData['summon']>, x: number, y: number) => this.summonMinions(cfg, x, y));

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
      respec: () => this.doRespec(), // also offered by the town Trainer (m2.3)
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
    this.inventoryUI = new InventoryUI({
      affixes: this.gameData.affixes,
      gear: () => this.saveData.gear,
      bag: () => this.saveData.bag,
      equip: (i) => this.equipFromBag(i),
      unequip: (slot) => this.unequipToBag(slot),
    });
    this.vendorStock = rollVendorStock(this.gameData.items, this.gameData.affixes, Math.random);
    this.shopUI = new ShopUI({
      affixes: this.gameData.affixes,
      gold: () => this.player.gold,
      stock: () => this.vendorStock,
      bag: () => this.saveData.bag,
      buyPrice: (item) => itemValue(item),
      sellPrice: (item) => sellValue(item),
      buy: (i) => this.buyFromVendor(i),
      sell: (i) => this.sellToVendor(i),
      repNote: () => this.vendorRepNote(),
    });
    this.stashUI = new StashUI({
      affixes: this.gameData.affixes,
      bag: () => this.saveData.bag,
      stash: () => this.saveData.stash,
      toStash: (i) => this.moveToStash(i),
      toBag: (i) => this.moveToBag(i),
    });
    this.repairUI = new RepairUI({
      gold: () => this.player.gold,
      repairables: () => this.repairables(),
      repair: (key) => this.repairOne(key),
      repairAll: () => this.repairAllGear(),
      recipes: () => this.craftEntries(),
      materials: () => this.materialStock(),
      craft: (id) => this.craftRecipe(id),
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
      this.inventoryUI.destroy();
      this.shopUI.destroy();
      this.stashUI.destroy();
      this.repairUI.destroy();
      this.projectiles.destroy();
      this.enemyShots.destroy();
      this.ground.destroy();
      this.traps.destroy();
      this.pet?.destroyPet();
      this.pet = null;
      for (const npc of this.npcs) npc.destroyNpc();
      this.npcs = [];
      for (const d of this.drops) d.gfx.destroy();
      this.drops = [];
    });
    kb.on('keydown-K', () => this.skillUI.togglePanel());
    kb.on('keydown-J', () => this.questUI.togglePanel());
    kb.on('keydown-I', () => this.inventoryUI.toggle());
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
    this.buildCorruptionAmbience();

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
      spawn: (id, x, y) => {
        const def = this.gameData.enemies.find((e) => e.id === id);
        if (!def) return false;
        this.makeEnemy(def, x, y);
        return true;
      },
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
        enemyShots: this.enemyShots.activeCount(),
        enemies: (this.enemies.getChildren() as Enemy[]).filter((e) => e.active).length,
        traps: this.traps.activeCount(),
        pet: this.pet ? { hp: this.pet.hp, dead: this.pet.dead } : null,
        drops: this.drops.length,
        bag: this.saveData.bag.length,
      }),
      debug: {
        teleport: (zone, x, y) => this.doTransition({ target: zone, targetX: x, targetY: y }),
        spawnItem: (slot, rarity) => this.debugSpawnItem(slot, rarity),
        spawnEnemy: (id, x, y) => window.__AZER!.spawn(id, x ?? this.player.x + 24, y ?? this.player.y),
        setCorruption: (n) => {
          this.saveData.world.corruption = Phaser.Math.Clamp(n, 0, 100);
          this.saveNow();
          this.publishHud();
          this.updateCorruptionAmbience();
          return this.saveData.world.corruption;
        },
        godMode: (on) => {
          this.debugGod = on ?? !this.debugGod;
          this.player.invulnerable = this.debugGod;
          if (this.debugGod) {
            this.player.dead = false;
            this.player.hp = this.player.maxHp;
          }
          this.numbers.spawn(this.player.x, this.player.y - 20, this.debugGod ? 'GOD MODE ON' : 'GOD MODE OFF', '#ffd84a');
          return this.debugGod;
        },
      },
    };
  }

  /** Debug: roll a loot item (optionally forcing slot/rarity) straight into the bag. */
  private debugSpawnItem(slot?: string, rarity?: string): string {
    const opts: { slot?: ItemSlot; rarity?: string } = {};
    if (slot) opts.slot = slot as ItemSlot;
    if (rarity) opts.rarity = rarity;
    const item = rollItem(this.gameData.items, this.gameData.affixes, Math.random, opts);
    this.saveData.bag.push(item);
    this.saveNow();
    this.inventoryUI.refresh();
    this.numbers.spawn(this.player.x, this.player.y - 14, item.name, '#6ee0d8');
    return item.name;
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
    // Conversations / shops freeze the player's own controls (movement/attacks)
    // but leave the rest of the sim running.
    const talking =
      this.dialogueUI.isOpen() || this.shopUI.isOpen() || this.stashUI.isOpen() || this.repairUI.isOpen();
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
        // A well purifies as it mends: bleed the corruption dial back down (m3).
        if (this.saveData.world.corruption > 0) {
          this.saveData.world.corruption = cleanseCorruption(this.saveData.world.corruption, dt);
          this.publishHud();
          this.updateCorruptionAmbience();
        }
      }
      if (trigger?.kind === 'secret' && !this.saveData.secrets.includes(trigger.secretId)) {
        this.discoverSecret(trigger);
      }
      // 'cutscene' triggers are parsed but inert until the cutscene system (m2.x).
    }

    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e.active) e.updateEnemy(dt, this.player, this.numbers);
    }
    this.tickRegionRespawns(dt);
    this.tickWorldBosses(dt);
    this.publishHud();
    this.skillUI.refresh();
    this.projectiles.update(dt);
    this.enemyShots.update(dt);
    this.ground.update(dt);
    this.traps.update(dt);
    this.pet?.updatePet(dt, this.player);
    if (this.drops.length) this.collectDrops();
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

  /** Creates an enemy scaled + possibly corrupted by the current tier, and adds it. */
  private makeEnemy(def: EnemyData, x: number, y: number): Enemy {
    const corruption = this.saveData.world.corruption;
    const tier = corruptionTier(corruption);
    const variant = corruptedEnemy(def, corruption); // recolor + extra move at high tiers
    const e = new Enemy(this, variant.def, x, y, this.player.level, tier.enemyHpMult, tier.enemyDmgMult, variant.tint);
    this.enemies.add(e);
    return e;
  }

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
      this.makeEnemy(this.pickFromPool(region.pool), x, y);
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

  /** Spawns an open-world boss and announces it; returns its instance id. */
  private spawnWorldBoss(spawn: WorldBossSpawn): number {
    const boss = this.makeEnemy(this.pickFromPool(spawn.pool), spawn.x, spawn.y);
    this.announceBoss(spawn.announce);
    return boss.eid;
  }

  /** After a world boss dies, count down and bring it back (while in-zone). */
  private tickWorldBosses(dt: number): void {
    const living = new Set((this.enemies.getChildren() as Enemy[]).filter((e) => e.active).map((e) => e.eid));
    for (const state of this.worldBossStates) {
      if (state.eid !== null && living.has(state.eid)) {
        state.timer = state.spawn.respawn; // still alive — hold the timer full
        continue;
      }
      state.eid = null; // it's down
      state.timer -= dt;
      if (state.timer <= 0) state.eid = this.spawnWorldBoss(state.spawn);
    }
  }

  /** Builds the screen-fixed corruption tint + ash/ember emitter (m3). */
  private buildCorruptionAmbience(): void {
    const cam = this.cameras.main;
    if (!this.textures.exists('mote')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture('mote', 2, 2);
      g.destroy();
    }
    this.corruptionOverlay = this.add
      .rectangle(0, 0, cam.width, cam.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30);
    // Motes drift down from above the screen, fading — ash at low corruption,
    // embers at high (the tint blends toward orange). Screen-fixed ambience.
    this.corruptionEmber = this.add.particles(0, 0, 'mote', {
      x: { min: 0, max: cam.width },
      y: -4,
      lifespan: 4200,
      speedY: { min: 10, max: 26 },
      speedX: { min: -8, max: 8 },
      scale: { min: 0.5, max: 1.4 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xe07830, 0x9aa0b0, 0xc85030],
      frequency: -1, // off until corruption rises
      quantity: 1,
    });
    this.corruptionEmber.setScrollFactor(0).setDepth(31);
    this.updateCorruptionAmbience();
  }

  /** Syncs the tint + ember rate to the current corruption tier. */
  private updateCorruptionAmbience(): void {
    if (!this.corruptionOverlay) return;
    const tier = corruptionTier(this.saveData.world.corruption);
    this.corruptionOverlay.setFillStyle(tier.tint, tier.overlayAlpha);
    this.corruptionEmber.frequency = tier.emberRate > 0 ? 1000 / tier.emberRate : -1;
  }

  /** A brief screen-fixed banner heralding a world boss's (re)spawn. */
  private announceBoss(text: string): void {
    const cam = this.cameras.main;
    const banner = this.add
      .text(cam.width / 2, 40, text, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffd84a',
        fontStyle: 'bold',
        align: 'center',
        stroke: '#2b2033',
        strokeThickness: 4,
        wordWrap: { width: cam.width - 24 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40);
    this.tweens.add({ targets: banner, alpha: 0, y: 30, delay: 2600, duration: 900, onComplete: () => banner.destroy() });
  }

  /** A summoner's call: spawn up to `count` minions near it, capped by `max`
   *  living minions of that type and a hard scene cap (perf guard). */
  private summonMinions(cfg: NonNullable<EnemyData['summon']>, x: number, y: number): void {
    const def = this.gameData.enemies.find((e) => e.id === cfg.minion);
    if (!def) return; // unknown minion id — validated content should never hit this
    const living = (this.enemies.getChildren() as Enemy[]).filter((e) => e.active);
    const ofType = living.filter((e) => e.def.id === cfg.minion).length;
    const HARD_CAP = 80; // never let summoners tank the frame budget
    let room = Math.min(cfg.count, cfg.max - ofType, HARD_CAP - living.length);
    for (let i = 0; room > 0 && i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 12;
      const sx = x + Math.cos(ang) * dist;
      const sy = y + Math.sin(ang) * dist;
      if (!walkableMask(this.solidMask, sx, sy, 6)) continue;
      this.makeEnemy(def, sx, sy);
      room--;
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
    const gs = gearStats(this.saveData.gear); // equipped item bonuses (m1.7)
    const p = this.player;
    const hpFrac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = Math.round((90 + p.level * 10) * (1 + (mods.maxHpPct ?? 0) / 100)) + gs.maxHp;
    p.hp = Math.min(p.maxHp, Math.max(1, Math.round(p.maxHp * hpFrac)));
    p.maxMp = manaMaxFor(p.level);
    p.mp = Math.min(p.mp, p.maxMp);
    p.critPct = 5 + (mods.critPct ?? 0) + gs.critPct;
    p.moveSpeedPct = (mods.moveSpeedPct ?? 0) + gs.moveSpeedPct;
    p.aspdPct = (mods.aspdPct ?? 0) + gs.aspdPct;
    p.cdrPct = (mods.cdrPct ?? 0) + gs.cdrPct;
    p.passiveDamagePct = mods.damagePct ?? 0;
    p.lifestealPct = (mods.lifestealPct ?? 0) + gs.lifestealPct;
    p.thornsPct = mods.thornsPct ?? 0;
    p.blockPct = mods.blockPct ?? 0;
    p.manaOnKill = (mods.manaOnKill ?? 0) + gs.manaOnKill;
    p.damageVsStunnedPct = mods.damageVsStunnedPct ?? 0;
    p.berserkDamagePct = mods.berserkDamagePct ?? 0;
    p.gearFlatDamage = gs.flatDamage;
    p.visionBonus = gs.visionBonus; // applies to the fog on the next zone load
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
    const corruption = this.saveData.world.corruption;
    this.registry.set('hud', {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      mp: this.player.mp,
      maxMp: this.player.maxMp,
      xp: this.player.xp,
      xpNext: xpToNext(this.player.level),
      level: this.player.level,
      dead: this.player.dead,
      corruption,
      corruptionTier: corruptionTier(corruption).name,
    });
  }

  // ---------- skills & xp ----------

  private effectiveDamage(): number {
    const p = this.player;
    const berserk = p.berserkDamagePct > 0 && p.hp < p.maxHp * 0.3 ? p.berserkDamagePct : 0;
    return (
      (playerBaseDamage(p.level) + p.gearFlatDamage) *
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
    this.maybeDropLoot(def, x, y);
    if (this.player.manaOnKill > 0) {
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + this.player.manaOnKill);
    }
    if (def.boss && !this.saveData.world.killedBosses.includes(def.id)) {
      this.saveData.world.killedBosses.push(def.id);
      this.saveNow();
    }
    // Relic fragment: a one-time collectible awarded on the enemy's death.
    if (def.relic && !this.saveData.relics.includes(def.relic)) {
      this.saveData.relics.push(def.relic);
      this.numbers.spawn(x, y - 20, `✦ RELIC: ${def.relicName ?? def.relic}`, '#6ee0d8');
      this.saveNow();
    }
    // Faction reputation: kills in a faction's zones build standing with it.
    const faction = factionForZone(this.gameData.factions, this.zoneId);
    if (faction) this.awardRep(faction.id, def.boss ? faction.bossRep : faction.killRep);
    // Corruption (m3): fighting raises the risk dial (bosses spike it). Only in
    // combat zones — a town kill (there are none) shouldn't corrupt you.
    if (this.enemyDefs.length > 0) {
      const before = corruptionTier(this.saveData.world.corruption).name;
      this.saveData.world.corruption = gainCorruption(this.saveData.world.corruption, def.boss === true);
      const after = corruptionTier(this.saveData.world.corruption);
      if (after.name !== before) this.numbers.spawn(this.player.x, this.player.y - 30, `☣ ${after.name}`, '#b06ad0');
      this.publishHud();
      this.updateCorruptionAmbience();
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
      // Vendor stock refreshes on level-up (roadmap).
      this.vendorStock = rollVendorStock(this.gameData.items, this.gameData.affixes, Math.random);
    }
    this.saveNow();
  }

  // ---------- quests ----------

  // ---------- loot ----------

  /** Bosses always drop gear; normal enemies roll a chance. Both may drop a
   *  material. Corruption raises the drop chance and the rarity "luck" (m3). */
  private maybeDropLoot(def: EnemyData, x: number, y: number): void {
    const tier = corruptionTier(this.saveData.world.corruption);
    if (def.boss || Math.random() < NORMAL_DROP_CHANCE + tier.dropChanceAdd) {
      const item = rollItem(this.gameData.items, this.gameData.affixes, Math.random, { luck: tier.rarityBonus });
      this.spawnItemDrop(x, y, item);
    }
    if (Math.random() < MATERIAL_DROP_CHANCE) {
      const mat = pickMaterial(this.gameData.recipes.materials, Math.random);
      // Nudge a co-dropped material aside so it doesn't stack under the gem.
      if (mat) this.spawnMaterialDrop(x + 8, y, mat.id, mat.name, Number.parseInt(mat.color.replace('#', ''), 16));
    }
  }

  private bob(gfx: Phaser.GameObjects.Rectangle, y: number): void {
    this.tweens.add({ targets: gfx, y: y - 3, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
  }

  private spawnItemDrop(x: number, y: number, item: ItemInstance): void {
    const gem = this.add
      .rectangle(x, y, 6, 6, RARITY_COLOR[item.rarity] ?? 0xffffff)
      .setStrokeStyle(1, 0x000000, 0.7)
      .setAngle(45)
      .setDepth(3);
    this.bob(gem, y);
    this.drops.push({ kind: 'item', item, gfx: gem });
  }

  private spawnMaterialDrop(x: number, y: number, material: string, name: string, color: number): void {
    const chip = this.add.rectangle(x, y, 5, 5, color).setStrokeStyle(1, 0x000000, 0.7).setDepth(3);
    this.bob(chip, y);
    this.drops.push({ kind: 'material', material, name, color, gfx: chip });
  }

  /** Collect any drop the player is standing on (item → bag, material → stock). */
  private collectDrops(): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      if (Phaser.Math.Distance.Between(d.gfx.x, d.gfx.y, this.player.x, this.player.y) > PICKUP_RANGE) continue;
      if (d.kind === 'item') {
        this.saveData.bag.push(d.item);
        this.numbers.spawn(this.player.x, this.player.y - 14, d.item.name, `#${(RARITY_COLOR[d.item.rarity] ?? 0xffffff).toString(16).padStart(6, '0')}`);
      } else {
        this.saveData.materials[d.material] = (this.saveData.materials[d.material] ?? 0) + 1;
        this.numbers.spawn(this.player.x, this.player.y - 14, `+${d.name}`, `#${d.color.toString(16).padStart(6, '0')}`);
        if (this.repairUI.isOpen()) this.repairUI.refresh();
      }
      d.gfx.destroy();
      this.drops.splice(i, 1);
      this.saveNow();
      this.inventoryUI.refresh();
    }
  }

  /** Equip bag[i]; whatever occupied the slot returns to the bag. */
  private equipFromBag(bagIndex: number): void {
    const item = this.saveData.bag[bagIndex];
    if (!item) return;
    const prev = this.saveData.gear[item.slot] ?? null;
    this.saveData.gear[item.slot] = item;
    this.saveData.bag.splice(bagIndex, 1);
    if (prev) this.saveData.bag.push(prev);
    this.onGearChanged();
  }

  private unequipToBag(slot: ItemSlot): void {
    const item = this.saveData.gear[slot];
    if (!item) return;
    this.saveData.gear[slot] = null;
    this.saveData.bag.push(item);
    this.onGearChanged();
  }

  /** Gear changed: rebuild derived stats, item-mods/hooks, hotbar, and the UIs. */
  private onGearChanged(): void {
    this.effectiveSkills = this.computeEffectiveSkills();
    this.collectItemHooks();
    this.hotbar = resolveLoadout(this.saveData.loadout.actives, this.effectiveSkills);
    this.recomputeStats();
    this.saveNow();
    this.skillUI.buildHotbar();
    this.inventoryUI.refresh();
  }

  // ---------- dialogue ----------

  /** E near an NPC opens their dialogue (talking also fires a talkTo objective). */
  private tryTalk(): void {
    // E toggles an open service panel closed.
    if (this.shopUI.isOpen()) return this.shopUI.close();
    if (this.stashUI.isOpen()) return this.stashUI.close();
    if (this.repairUI.isOpen()) return this.repairUI.close();
    if (this.dialogueUI.isOpen() || this.player.dead || this.transitioning) return;
    const npc = this.npcs.find((n) => n.inRange(this.player));
    if (!npc) return;
    this.player.setVelocity(0, 0);
    this.questEvent('talkTo', npc.def.id); // any interaction can satisfy a talkTo
    if (npc.def.service === 'vendor') return this.openVendor(npc.def.faction ?? null);
    if (npc.def.service === 'stash') return this.stashUI.openStash();
    if (npc.def.service === 'blacksmith') return this.repairUI.openRepair();
    const tree = this.gameData.dialogue.find((t) => t.id === npc.def.dialogue);
    if (!tree) return;
    this.dialogueNpc = npc;
    this.dialogueTree = tree;
    this.dialogueNodeId = tree.startNodeId;
    this.renderDialogueNode();
  }

  // ---------- vendor ----------

  /** Opens a vendor. A faction vendor stocks more the higher your standing. */
  private openVendor(factionId: string | null): void {
    this.activeVendorFaction = factionId;
    const faction = factionId ? this.gameData.factions.find((f) => f.id === factionId) : undefined;
    if (faction) {
      const bonus = repTier(faction, this.saveData.reputation[faction.id] ?? 0).vendorBonus;
      this.vendorStock = rollVendorStock(this.gameData.items, this.gameData.affixes, Math.random, 8 + bonus);
    }
    this.shopUI.openShop();
  }

  /** The standing line shown in a faction vendor's shop header (null otherwise). */
  private vendorRepNote(): string | null {
    const faction = this.activeVendorFaction ? this.gameData.factions.find((f) => f.id === this.activeVendorFaction) : undefined;
    if (!faction) return null;
    const { tier, next, toNext } = repProgress(faction, this.saveData.reputation[faction.id] ?? 0);
    return next ? `${faction.name}: ${tier.name} — ${toNext} rep to ${next.name}` : `${faction.name}: ${tier.name} (max)`;
  }

  /** Adds faction rep, toasting on a tier-up. Pure math lives in factions.ts. */
  private awardRep(factionId: string, amount: number): void {
    if (amount <= 0) return;
    const faction = this.gameData.factions.find((f) => f.id === factionId);
    if (!faction) return;
    const before = this.saveData.reputation[factionId] ?? 0;
    this.saveData.reputation = addRep(this.saveData.reputation, factionId, amount);
    const after = before + amount;
    const beforeTier = repTier(faction, before);
    const afterTier = repTier(faction, after);
    if (afterTier.threshold > beforeTier.threshold) {
      this.numbers.spawn(this.player.x, this.player.y - 26, `✦ ${faction.name}: ${afterTier.name}`, '#9bd44a');
    }
    this.saveNow();
  }

  /** Collects a hidden secret once: records it, toasts the lore, grants rewards. */
  private discoverSecret(secret: SecretTrigger): void {
    this.saveData.secrets.push(secret.secretId);
    this.secretMarkers.get(secret.secretId)?.destroy();
    this.secretMarkers.delete(secret.secretId);
    this.numbers.spawn(this.player.x, this.player.y - 30, '✦ SECRET FOUND', '#6ee0d8');
    this.numbers.spawn(this.player.x, this.player.y - 18, secret.lore, '#c8b48a');
    if (secret.gold > 0) {
      this.player.gold += secret.gold;
      this.numbers.spawn(this.player.x + 18, this.player.y - 6, `+${secret.gold}g`, '#e8c86a');
    }
    if (secret.relic && !this.saveData.relics.includes(secret.relic)) {
      this.saveData.relics.push(secret.relic);
      this.numbers.spawn(this.player.x, this.player.y + 6, `✦ RELIC: ${secret.relicName ?? secret.relic}`, '#6ee0d8');
    }
    this.saveNow();
  }

  private buyFromVendor(stockIndex: number): void {
    const item = this.vendorStock[stockIndex];
    if (!item) return;
    const price = itemValue(item);
    if (this.player.gold < price) return;
    this.player.gold -= price;
    this.saveData.bag.push(item);
    this.vendorStock.splice(stockIndex, 1);
    this.saveNow();
    this.shopUI.refresh();
    this.inventoryUI.refresh();
  }

  private sellToVendor(bagIndex: number): void {
    const item = this.saveData.bag[bagIndex];
    if (!item) return;
    this.player.gold += sellValue(item);
    this.saveData.bag.splice(bagIndex, 1);
    this.saveNow();
    this.shopUI.refresh();
    this.inventoryUI.refresh();
  }

  // ---------- stash ----------

  private moveToStash(bagIndex: number): void {
    const item = this.saveData.bag[bagIndex];
    if (!item) return;
    this.saveData.bag.splice(bagIndex, 1);
    this.saveData.stash.push(item);
    this.saveNow();
    this.stashUI.refresh();
    this.inventoryUI.refresh();
  }

  private moveToBag(stashIndex: number): void {
    const item = this.saveData.stash[stashIndex];
    if (!item) return;
    this.saveData.stash.splice(stashIndex, 1);
    this.saveData.bag.push(item);
    this.saveNow();
    this.stashUI.refresh();
    this.inventoryUI.refresh();
  }

  // ---------- blacksmith (repair) ----------

  /** Worn equipped + bag items, keyed so a repair maps back to its location. */
  private repairables(): RepairEntry[] {
    const out: RepairEntry[] = [];
    const worn = (item: ItemInstance): boolean =>
      item.maxDurability !== undefined && item.durability !== undefined && item.durability < item.maxDurability;
    const entry = (key: string, item: ItemInstance): RepairEntry => ({
      key,
      name: item.name,
      rarity: item.rarity,
      durability: item.durability ?? 0,
      maxDurability: item.maxDurability ?? 0,
      cost: repairCost(item),
    });
    for (const slot of Object.keys(this.saveData.gear) as ItemSlot[]) {
      const item = this.saveData.gear[slot];
      if (item && worn(item)) out.push(entry(`gear:${slot}`, item));
    }
    this.saveData.bag.forEach((item, i) => {
      if (worn(item)) out.push(entry(`bag:${i}`, item));
    });
    return out;
  }

  private itemByKey(key: string): ItemInstance | null {
    const [where, id] = key.split(':');
    if (where === 'gear') return this.saveData.gear[id as ItemSlot] ?? null;
    return this.saveData.bag[Number(id)] ?? null;
  }

  private repairOne(key: string): void {
    const item = this.itemByKey(key);
    if (!item || item.maxDurability === undefined) return;
    const cost = repairCost(item);
    if (this.player.gold < cost) return;
    this.player.gold -= cost;
    item.durability = item.maxDurability;
    if (key.startsWith('gear:')) this.recomputeStats(); // un-break equipped gear
    this.saveNow();
    this.repairUI.refresh();
    this.inventoryUI.refresh();
  }

  private repairAllGear(): void {
    // Snapshot keys (repairing only restores durability, so indices stay valid).
    for (const e of this.repairables()) this.repairOne(e.key);
  }

  // ---------- blacksmith (crafting) ----------

  /** The player's material stock as UI rows (materials they hold ≥1 of). */
  private materialStock(): MaterialStock[] {
    return this.gameData.recipes.materials
      .map((m) => ({ name: m.name, color: m.color, count: this.saveData.materials[m.id] ?? 0 }))
      .filter((m) => m.count > 0);
  }

  /** Recipes resolved against the current stock/gold for the blacksmith panel. */
  private craftEntries(): CraftEntry[] {
    const mats = this.gameData.recipes.materials;
    const matName = (id: string): { name: string; color: string } => {
      const m = mats.find((x) => x.id === id);
      return { name: m?.name ?? id, color: m?.color ?? '#b7b0a0' };
    };
    return this.gameData.recipes.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      inputs: r.inputs.map((i) => ({ ...matName(i.material), have: this.saveData.materials[i.material] ?? 0, need: i.count })),
      gold: r.gold,
      resultLabel: `${r.result.rarity} ${r.result.slot}`,
      resultRarity: r.result.rarity,
      can: canCraft(r, this.saveData.materials, this.player.gold),
    }));
  }

  private craftRecipe(recipeId: string): void {
    const recipe = this.gameData.recipes.recipes.find((r) => r.id === recipeId);
    if (!recipe || !canCraft(recipe, this.saveData.materials, this.player.gold)) return;
    this.saveData.materials = spendInputs(recipe, this.saveData.materials);
    this.player.gold -= recipe.gold;
    const item = craftItem(recipe, this.gameData.items, this.gameData.affixes, Math.random);
    this.saveData.bag.push(item);
    this.numbers.spawn(this.player.x, this.player.y - 14, `Forged ${item.name}`, `#${(RARITY_COLOR[item.rarity] ?? 0xffffff).toString(16).padStart(6, '0')}`);
    this.saveNow();
    this.repairUI.refresh();
    this.inventoryUI.refresh();
  }

  /** Wear a point off equipped gear every couple of swings; re-derive on break. */
  private wearGear(): void {
    if (++this.attackWearCounter < 2) return;
    this.attackWearCounter = 0;
    let broke = false;
    for (const slot of Object.keys(this.saveData.gear) as ItemSlot[]) {
      const item = this.saveData.gear[slot];
      if (!item || item.durability === undefined || item.durability <= 0) continue;
      item.durability -= 1;
      if (item.durability === 0) broke = true;
    }
    if (broke) {
      this.recomputeStats();
      this.numbers.spawn(this.player.x, this.player.y - 14, 'GEAR BROKE', '#d8503f');
      this.saveNow();
    }
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
    if (choice.action?.respec) {
      this.doRespec();
      this.numbers.spawn(this.player.x, this.player.y - 14, 'SKILLS RESET', '#8bd06a');
    }
    if (choice.nextNodeId) {
      this.dialogueNodeId = choice.nextNodeId;
      this.renderDialogueNode();
    } else {
      this.dialogueUI.close();
    }
  }

  /** Refunds all skill points and clears slotted passives (Trainer / K-panel). */
  private doRespec(): void {
    this.saveData.skillRanks = {};
    this.saveData.loadout.passives = [null, null, null, null, null, null];
    this.recomputeStats();
    this.skillUI.buildPassiveBar();
    this.saveNow();
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
    if (quest.rewards.faction && quest.rewards.rep) this.awardRep(quest.rewards.faction, quest.rewards.rep);
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
    this.wearGear();
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
