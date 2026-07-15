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
  maxHp = 100; // prototype: 90 + level*10
  hp = 100;
  atkCd = 0;
  dead = false;

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

  takeDamage(amount: number, numbers: DamageNumbers): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    numbers.spawn(this.x, this.y, amount, '#f08060');
    this.setAlpha(0.55);
    this.scene.time.delayedCall(150, () => {
      if (!this.dead) this.setAlpha(1);
    });
    if (this.hp <= 0) this.dead = true;
  }

  respawn(x: number, y: number): void {
    this.dead = false;
    this.hp = this.maxHp;
    this.setAlpha(1);
    this.setPosition(x, y);
    this.setVelocity(0, 0);
  }
}
