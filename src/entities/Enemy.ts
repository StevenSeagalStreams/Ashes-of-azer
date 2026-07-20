import Phaser from 'phaser';
import type { EnemyData } from '../data/schemas/index.ts';
import { CONTACT_RANGE, ENEMY_ATTACK_COOLDOWN, scaledEnemyHp, type HitResult } from '../systems/combat.ts';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { addSpriteTexture, spriteRowsFor } from '../systems/pixelart.ts';
import type { Player } from './Player.ts';

let nextEnemyId = 1;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly def: EnemyData;
  /** Stable per-instance id (projectile pierce/chain tracking). */
  readonly eid = nextEnemyId++;
  hp: number;
  readonly maxHp: number;
  private atkCd = 0;
  private stunT = 0;
  private slamT = 3; // prototype: first boss slam 3s after spawn
  isStunned = false;
  // Two independent DoT channels so bleed (physical) and burn (fire) can stack.
  private bleed = { dps: 0, t: 0, tick: 0 };
  private burn = { dps: 0, t: 0, tick: 0 };
  private chillPct = 0;
  private chillT = 0;
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
    if (this.chillT > 0) {
      this.chillT -= dt;
      if (this.chillT <= 0) this.chillPct = 0;
    }
    // DoT channels tick ~2/s and apply even while stunned.
    if (this.tickDoT(this.bleed, dt, '#8bd06a', numbers)) return;
    if (this.tickDoT(this.burn, dt, '#e07830', numbers)) return;
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
      const chill = 1 - this.chillPct / 100; // frost slow
      const vx = ((player.x - this.x) / d) * this.def.spd * chill;
      const vy = ((player.y - this.y) / d) * this.def.spd * chill;
      this.setVelocity(vx, vy);
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

  /** Advances one DoT channel; returns true if it killed the enemy. */
  private tickDoT(dot: { dps: number; t: number; tick: number }, dt: number, color: string, numbers: DamageNumbers): boolean {
    if (dot.t <= 0) return false;
    dot.t -= dt;
    dot.tick -= dt;
    if (dot.tick <= 0) {
      dot.tick = 0.5;
      const amount = Math.round(dot.dps * 0.5);
      this.hp -= amount;
      numbers.spawn(this.x, this.y, amount, color);
      if (this.hp <= 0) {
        this.die();
        return true;
      }
    }
    return false;
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
    this.bleed.dps = Math.max(this.bleed.dps, dps);
    this.bleed.t = Math.max(this.bleed.t, duration);
  }

  applyBurn(dps: number, duration: number): void {
    this.burn.dps = Math.max(this.burn.dps, dps);
    this.burn.t = Math.max(this.burn.t, duration);
  }

  applyChill(pct: number, duration: number): void {
    this.chillPct = Math.max(this.chillPct, pct);
    this.chillT = Math.max(this.chillT, duration);
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
    this.scene.events.emit('enemy-died', this.def, this.x, this.y);
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
    this.destroy();
  }
}
