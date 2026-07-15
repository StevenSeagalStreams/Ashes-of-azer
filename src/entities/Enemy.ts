import Phaser from 'phaser';
import {
  CONTACT_RANGE,
  ENEMY_ATTACK_COOLDOWN,
  ETYPES,
  scaledEnemyHp,
  type EnemyType,
  type HitResult,
} from '../systems/combat.ts';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { addSpriteTexture, BAT_ROWS, SLIME_ROWS } from '../systems/pixelart.ts';
import type { Player } from './Player.ts';

const SPRITE_ROWS: Record<EnemyType, string[]> = {
  slime: SLIME_ROWS,
  bat: BAT_ROWS,
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly etype: EnemyType;
  hp: number;
  readonly maxHp: number;
  private atkCd = 0;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, type: EnemyType, x: number, y: number, playerLevel: number) {
    addSpriteTexture(scene, type, SPRITE_ROWS[type]);
    super(scene, x, y, type);
    this.etype = type;
    this.maxHp = scaledEnemyHp(ETYPES[type].hp, playerLevel);
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const def = ETYPES[type];
    (this.body as Phaser.Physics.Arcade.Body).setSize(def.w, def.h);
    this.hpBarBg = scene.add.rectangle(x, y, 12, 3, 0x000000, 0.65).setDepth(5);
    this.hpBarFg = scene.add.rectangle(x, y, 12, 3, 0xe4574f).setDepth(6).setOrigin(0, 0.5);
  }

  updateEnemy(dt: number, player: Player, numbers: DamageNumbers): void {
    const def = ETYPES[this.etype];
    this.atkCd = Math.max(0, this.atkCd - dt);
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (d < def.aggro && d > 2) {
      const vx = (player.x - this.x) / d;
      const vy = (player.y - this.y) / d;
      this.setVelocity(vx * def.spd, vy * def.spd);
    } else {
      this.setVelocity(0, 0);
    }
    if (d < CONTACT_RANGE && this.atkCd <= 0) {
      this.atkCd = ENEMY_ATTACK_COOLDOWN;
      player.takeDamage(def.dmg, numbers);
    }
    const barY = this.y - this.height / 2 - 6;
    this.hpBarBg.setPosition(this.x, barY);
    this.hpBarFg.setPosition(this.x - 6, barY);
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
