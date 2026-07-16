import Phaser from 'phaser';
import type { EnemyData } from '../data/schemas/index.ts';
import { CONTACT_RANGE, ENEMY_ATTACK_COOLDOWN, scaledEnemyHp, type HitResult } from '../systems/combat.ts';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { addSpriteTexture, spriteRowsFor } from '../systems/pixelart.ts';
import type { Player } from './Player.ts';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly def: EnemyData;
  hp: number;
  readonly maxHp: number;
  private atkCd = 0;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, def: EnemyData, x: number, y: number, playerLevel: number) {
    addSpriteTexture(scene, def.sprite, spriteRowsFor(def.sprite));
    super(scene, x, y, def.sprite);
    this.def = def;
    this.maxHp = scaledEnemyHp(def.hp, playerLevel);
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setSize(def.width, def.height);
    const barWidth = def.boss ? 30 : 12;
    this.hpBarBg = scene.add.rectangle(x, y, barWidth, 3, 0x000000, 0.65).setDepth(5);
    this.hpBarFg = scene.add
      .rectangle(x, y, barWidth, 3, 0xe4574f)
      .setDepth(6)
      .setOrigin(0, 0.5);
  }

  updateEnemy(dt: number, player: Player, numbers: DamageNumbers): void {
    this.atkCd = Math.max(0, this.atkCd - dt);
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (d < this.def.aggro && d > 2) {
      const vx = (player.x - this.x) / d;
      const vy = (player.y - this.y) / d;
      this.setVelocity(vx * this.def.spd, vy * this.def.spd);
    } else {
      this.setVelocity(0, 0);
    }
    if (d < CONTACT_RANGE && this.atkCd <= 0) {
      this.atkCd = ENEMY_ATTACK_COOLDOWN;
      player.takeDamage(this.def.dmg, numbers);
    }
    const barWidth = this.def.boss ? 30 : 12;
    const barY = this.y - this.height / 2 - 6;
    this.hpBarBg.setPosition(this.x, barY);
    this.hpBarFg.setPosition(this.x - barWidth / 2, barY);
    this.hpBarFg.setScale(Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1), 1);
  }

  takeHit(hit: HitResult, numbers: DamageNumbers): void {
    this.hp -= hit.amount;
    numbers.spawn(this.x, this.y, hit.amount, hit.crit ? '#ffd84a' : '#ffffff');
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => this.clearTint());
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
    this.destroy();
  }
}
