import Phaser from 'phaser';
import { addSpriteTexture, HERO_ROWS } from '../systems/pixelart.ts';

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
    const k = this.keys;
    const dx = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown);
    const dy = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown);
    if (dx !== 0 || dy !== 0) this.facing.set(dx, dy).normalize();
    const speed = BASE_SPEED * (1 + this.moveSpeedPct / 100);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(speed);
    this.setVelocity(v.x, v.y);
  }
}
