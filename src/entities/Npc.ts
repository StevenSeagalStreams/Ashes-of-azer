import Phaser from 'phaser';
import type { NpcData } from '../data/schemas/index.ts';
import { addSpriteTexture, spriteRowsFor } from '../systems/pixelart.ts';
import type { Player } from './Player.ts';

export const NPC_INTERACT_RANGE = 26;
const WANDER_RADIUS = 22;
const WANDER_SPEED = 18;

/**
 * A town/quest NPC (Milestone 2.2). Placed data-first (zone + x/y), optionally
 * wanders around its spawn, shows a floating "Talk" prompt when the player is
 * close, and carries a ! / ? quest marker the scene refreshes from quest state.
 */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  readonly def: NpcData;
  private readonly homeX: number;
  private readonly homeY: number;
  private wanderT = 0;
  private readonly nameTag: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Text;
  private readonly prompt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, def: NpcData) {
    addSpriteTexture(scene, def.sprite, spriteRowsFor(def.sprite));
    super(scene, def.x, def.y, def.sprite);
    this.def = def;
    this.homeX = def.x;
    this.homeY = def.y;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.setDepth(4);
    this.nameTag = scene.add
      .text(def.x, def.y, def.name, { fontFamily: 'monospace', fontSize: '7px', color: '#f7efd8' })
      .setOrigin(0.5, 1)
      .setStroke('#000000', 2)
      .setDepth(6);
    this.marker = scene.add
      .text(def.x, def.y, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold' })
      .setOrigin(0.5, 1)
      .setStroke('#000000', 3)
      .setDepth(6);
    this.prompt = scene.add
      .text(def.x, def.y, '▲ Talk (E)', { fontFamily: 'monospace', fontSize: '7px', color: '#ffd84a' })
      .setOrigin(0.5, 0)
      .setStroke('#000000', 2)
      .setDepth(6)
      .setVisible(false);
  }

  inRange(player: Player): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <= NPC_INTERACT_RANGE;
  }

  /** Wander, reposition labels, refresh the prompt + quest marker. */
  updateNpc(dt: number, player: Player, marker: '!' | '?' | null): void {
    if (this.def.wander) this.wander(dt);
    const topY = this.y - this.height / 2 - 4;
    this.nameTag.setPosition(this.x, topY);
    this.marker.setPosition(this.x, topY - 8);
    this.prompt.setPosition(this.x, this.y + this.height / 2 + 2);

    this.marker.setText(marker ?? '').setColor(marker === '!' ? '#ffd84a' : '#c8c8ff');
    this.prompt.setVisible(this.inRange(player));
  }

  private wander(dt: number): void {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = Phaser.Math.FloatBetween(1.2, 3);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const inHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY) < WANDER_RADIUS;
      // If we've strayed, steer back home; otherwise pick a fresh direction.
      const dir = inHome ? a : Math.atan2(this.homeY - this.y, this.homeX - this.x);
      this.setVelocity(Math.cos(dir) * WANDER_SPEED, Math.sin(dir) * WANDER_SPEED);
    }
  }

  destroyNpc(): void {
    this.nameTag.destroy();
    this.marker.destroy();
    this.prompt.destroy();
    this.destroy();
  }
}
