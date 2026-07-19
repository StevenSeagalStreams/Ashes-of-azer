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
  private stunT = 0;
  private slamT = 3; // prototype: first boss slam 3s after spawn
  isStunned = false;
  private bleedDps = 0;
  private bleedT = 0;
  private bleedTick = 0;
  private vulnerablePct = 0;
  private vulnerableT = 0;
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
    if (this.vulnerableT > 0) {
      this.vulnerableT -= dt;
      if (this.vulnerableT <= 0) this.vulnerablePct = 0;
    }
    // Bleed damage-over-time (ticks ~2/s), applies even while stunned.
    if (this.bleedT > 0) {
      this.bleedT -= dt;
      this.bleedTick -= dt;
      if (this.bleedTick <= 0) {
        this.bleedTick = 0.5;
        const tick = Math.round(this.bleedDps * 0.5);
        this.hp -= tick;
        numbers.spawn(this.x, this.y, tick, '#8bd06a');
        if (this.hp <= 0) {
          this.die();
          return;
        }
      }
    }
    // Prototype: stunned enemies neither move nor attack (nor slam).
    this.isStunned = this.stunT > 0;
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.setVelocity(0, 0);
      this.positionHpBar();
      return;
    }
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
      this.receiveThorns(player.takeDamage(this.def.dmg, numbers), numbers);
    }
    // Data-driven AoE ground slam (prototype: Rotfang every 4.5s).
    const slam = this.def.slam;
    if (slam) {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = slam.interval;
        const ring = this.scene.add
          .image(this.x, this.y, 'ring')
          .setDepth(7)
          .setScale((slam.radius * 2) / 64);
        this.scene.tweens.add({ targets: ring, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
        if (d < slam.radius) this.receiveThorns(player.takeDamage(slam.damage, numbers), numbers);
      }
    }
    this.positionHpBar();
  }

  private receiveThorns(thorns: number, numbers: DamageNumbers): void {
    if (thorns <= 0 || !this.active) return;
    this.hp -= thorns;
    numbers.spawn(this.x, this.y, thorns, '#4f9c3f');
    if (this.hp <= 0) this.die();
  }

  private positionHpBar(): void {
    const barWidth = this.def.boss ? 30 : 12;
    const barY = this.y - this.height / 2 - 6;
    this.hpBarBg.setPosition(this.x, barY);
    this.hpBarFg.setPosition(this.x - barWidth / 2, barY);
    this.hpBarFg.setScale(Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1), 1);
  }

  applyStun(duration: number): void {
    this.stunT = Math.max(this.stunT, duration);
    this.isStunned = true;
  }

  applyBleed(dps: number, duration: number): void {
    // Refresh with the stronger DoT rather than stacking.
    this.bleedDps = Math.max(this.bleedDps, dps);
    this.bleedT = Math.max(this.bleedT, duration);
  }

  applyVulnerable(pct: number, duration: number): void {
    this.vulnerablePct = Math.max(this.vulnerablePct, pct);
    this.vulnerableT = Math.max(this.vulnerableT, duration);
  }

  /** Applies a hit through vulnerability; returns the damage actually dealt. */
  takeHit(hit: HitResult, numbers: DamageNumbers): number {
    const amount = Math.round(hit.amount * (1 + this.vulnerablePct / 100));
    this.hp -= amount;
    numbers.spawn(this.x, this.y, amount, hit.crit ? '#ffd84a' : '#ffffff');
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => this.clearTint());
    if (this.hp <= 0) this.die();
    return amount;
  }

  private die(): void {
    this.scene.events.emit('enemy-died', this.def);
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
    this.destroy();
  }
}
