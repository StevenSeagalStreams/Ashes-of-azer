import Phaser from 'phaser';
import { addSpriteTexture, HERO_ROWS } from '../systems/pixelart.ts';
import type { DamageNumbers } from '../systems/DamageNumbers.ts';

// Prototype: spd = 78 * (1 + ST.ms/100) px/s (update() movement block).
const BASE_SPEED = 78;

type MoveKeys = Record<
  'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT',
  Phaser.Input.Keyboard.Key
>;

export class Player extends Phaser.Physics.Arcade.Sprite {
  /** Last non-zero movement direction; skills aim along this later. */
  readonly facing = new Phaser.Math.Vector2(1, 0);
  /** +% movement speed from gear; wired to real stats in Milestone 0.3. */
  moveSpeedPct = 0;
  /** Gear stats stubs — real derived stats land with items in Milestone 0.3. */
  aspdPct = 0;
  critPct = 5; // prototype pstats() base crit
  /** +Vision from gear pushes back the fog; real stat lands in Milestone 0.3. */
  visionBonus = 0;
  level = 1;
  /** Earned but unused until XP/leveling lands (m1.1); persisted by saves. */
  xp = 0;
  /** No economy until the vendor (m2.3); persisted by saves. */
  gold = 0;
  maxHp = 100; // prototype: 90 + level*10
  hp = 100;
  maxMp = 55; // prototype: 50 + level*5
  mp = 55;
  cdrPct = 0; // gear stat stub (m0.3 data, wired with items)
  atkCd = 0;
  dead = false;
  // From slotted passives (recomputed by the scene each stat change).
  passiveDamagePct = 0;
  lifestealPct = 0;
  thornsPct = 0;
  blockPct = 0;
  manaOnKill = 0;
  damageVsStunnedPct = 0;
  berserkDamagePct = 0;
  /** War Cry: +damage% while the timer runs. */
  damageBuffPct = 0;
  private damageBuffT = 0;
  /** Iron Guard: % incoming damage reduced while the timer runs. */
  damageReductionPct = 0;
  private damageReductionT = 0;
  /** Rapid Fire: +attack-speed% while the timer runs (on top of gear aspd). */
  aspdBuffPct = 0;
  private aspdBuffT = 0;

  private rng: () => number = Math.random;

  private readonly keys: MoveKeys;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    addSpriteTexture(scene, 'hero', HERO_ROWS);
    super(scene, x, y, 'hero');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Prototype collides a radius-5 circle; a 10x10 box is the arcade equivalent.
    (this.body as Phaser.Physics.Arcade.Body).setSize(10, 10);
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('keyboard plugin unavailable');
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as MoveKeys;
  }

  override update(): void {
    if (this.dead) {
      this.setVelocity(0, 0);
      return;
    }
    const k = this.keys;
    const dx = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown);
    const dy = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown);
    if (dx !== 0 || dy !== 0) this.facing.set(dx, dy).normalize();
    const speed = BASE_SPEED * (1 + this.moveSpeedPct / 100);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(speed);
    this.setVelocity(v.x, v.y);
  }

  /**
   * Applies an incoming hit through block → damage-reduction. Returns the
   * thorns damage to reflect back at the attacker (0 if none), so the caller
   * (the attacking enemy) can take it.
   */
  takeDamage(amount: number, numbers: DamageNumbers): number {
    if (this.dead) return 0;
    if (this.blockPct > 0 && this.rng() * 100 < this.blockPct) {
      numbers.spawn(this.x, this.y, 'BLOCK', '#7fa8ee');
      return 0;
    }
    const taken = Math.round(amount * (1 - this.damageReductionPct / 100));
    this.hp = Math.max(0, this.hp - taken);
    numbers.spawn(this.x, this.y, taken, '#f08060');
    this.setAlpha(0.55);
    this.scene.time.delayedCall(150, () => {
      if (!this.dead) this.setAlpha(1);
    });
    if (this.hp <= 0) this.dead = true;
    return this.thornsPct > 0 ? Math.round(amount * (this.thornsPct / 100)) : 0;
  }

  /** Test/seam hook so block rolls are deterministic in headless runs. */
  setRng(rng: () => number): void {
    this.rng = rng;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  respawn(x: number, y: number): void {
    this.dead = false;
    this.hp = this.maxHp;
    this.setAlpha(1);
    this.setPosition(x, y);
    this.setVelocity(0, 0);
  }

  applyDamageBuff(pct: number, duration: number): void {
    this.damageBuffPct = pct;
    this.damageBuffT = duration;
  }

  applyDamageReduction(pct: number, duration: number): void {
    this.damageReductionPct = pct;
    this.damageReductionT = duration;
  }

  applyAttackSpeedBuff(pct: number, duration: number): void {
    this.aspdBuffPct = pct;
    this.aspdBuffT = duration;
  }

  /** Ticks timed effects; called from the scene's update. */
  tickEffects(dt: number): void {
    if (this.damageBuffT > 0) {
      this.damageBuffT -= dt;
      if (this.damageBuffT <= 0) this.damageBuffPct = 0;
    }
    if (this.damageReductionT > 0) {
      this.damageReductionT -= dt;
      if (this.damageReductionT <= 0) this.damageReductionPct = 0;
    }
    if (this.aspdBuffT > 0) {
      this.aspdBuffT -= dt;
      if (this.aspdBuffT <= 0) this.aspdBuffPct = 0;
    }
  }
}
