import Phaser from 'phaser';
import type { EnemyData } from '../data/schemas/index.ts';
import { CONTACT_RANGE, ENEMY_ATTACK_COOLDOWN, scaledEnemyHp, type HitResult } from '../systems/combat.ts';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { addSpriteTexture, spriteRowsFor } from '../systems/pixelart.ts';
import { moveMode } from '../systems/enemyAI.ts';
import type { Player } from './Player.ts';

let nextEnemyId = 1;

// Attack telegraphs (m1.6): brace + flash before a contact hit, and show the
// slam ring before the slam lands — so every hit is readable and dodgeable.
const CONTACT_WINDUP = 0.28;
const SLAM_WINDUP = 0.4;
const WINDUP_TINT = 0xffd24a;

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
  private bobPhase = 0; // procedural walk squash (m1.6)
  private windupT = 0; // contact-attack telegraph timer
  private slamPendingT = 0; // slam telegraph → impact timer
  private knockT = 0; // brief window where knockback velocity overrides the AI
  // ---- attack-pattern state (m2.4) ----
  private chargeCd = 0;
  private chargeWindupT = 0; // charge telegraph → dash
  private chargeDashT = 0; // active dash
  private chargeVX = 0;
  private chargeVY = 0;
  private chargeHit = false; // dash contact damage lands once per dash
  private rangedCd = 0;
  private explodePendingT = 0; // explode telegraph → detonation
  private summonT = 2; // first summon 2s after spawn
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFg: Phaser.GameObjects.Rectangle;

  // Corruption scales enemies at spawn (m3): HP and damage-dealt multipliers.
  private readonly dmgMult: number;

  constructor(scene: Phaser.Scene, def: EnemyData, x: number, y: number, playerLevel: number, hpMult = 1, dmgMult = 1) {
    addSpriteTexture(scene, def.sprite, spriteRowsFor(def.sprite));
    super(scene, x, y, def.sprite);
    this.def = def;
    this.dmgMult = dmgMult;
    this.maxHp = Math.round(scaledEnemyHp(def.hp, playerLevel) * hpMult);
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
    this.chargeCd = Math.max(0, this.chargeCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
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
    // Knockback: let the impulse carry (decaying) and ignore the AI briefly.
    if (this.knockT > 0) {
      this.knockT -= dt;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.velocity.scale(0.85);
      this.positionHpBar();
      return;
    }
    // Contact-attack windup: brace + flash, then strike if still in reach.
    if (this.windupT > 0) {
      this.windupT -= dt;
      this.setVelocity(0, 0);
      if (this.windupT <= 0) {
        this.clearTint();
        const reach = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (reach < CONTACT_RANGE + 4) this.receiveThorns(this.hitPlayer(player, this.def.dmg, numbers), numbers);
      }
      this.positionHpBar();
      return;
    }
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    // Charger (m2.4): telegraph in place, then dash the locked heading, dealing a
    // contact hit once. Overrides normal movement while winding up or dashing.
    if (this.def.charge) {
      if (this.chargeWindupT > 0) {
        this.chargeWindupT -= dt;
        this.setVelocity(0, 0);
        if (this.chargeWindupT <= 0) {
          this.clearTint();
          const dd = d || 1;
          this.chargeVX = ((player.x - this.x) / dd) * this.def.charge.speed;
          this.chargeVY = ((player.y - this.y) / dd) * this.def.charge.speed;
          this.chargeDashT = this.def.charge.duration;
          this.chargeHit = false;
        }
        this.positionHpBar();
        return;
      }
      if (this.chargeDashT > 0) {
        this.chargeDashT -= dt;
        this.setVelocity(this.chargeVX, this.chargeVY);
        if (!this.chargeHit && d < CONTACT_RANGE + 4) {
          this.chargeHit = true;
          this.receiveThorns(this.hitPlayer(player, this.def.dmg, numbers), numbers);
        }
        if (this.chargeDashT <= 0) {
          this.chargeCd = this.def.charge.cooldown;
          this.setVelocity(0, 0);
        }
        this.positionHpBar();
        return;
      }
    }
    // Movement: chase, kite (keepDistance), or hold — direction from the pure helper.
    const mode = moveMode(d, this.def.aggro, this.def.keepDistance);
    const chill = 1 - this.chillPct / 100; // frost slow
    if (mode === 'chase' || mode === 'kite') {
      const sign = mode === 'kite' ? -1 : 1;
      const vx = (((player.x - this.x) / d) * this.def.spd * chill) * sign;
      const vy = (((player.y - this.y) / d) * this.def.spd * chill) * sign;
      this.setVelocity(vx, vy);
      this.bobPhase += dt * 14; // walk squash while moving
      const s = Math.sin(this.bobPhase);
      this.setScale(1 - s * 0.05, 1 + s * 0.06);
    } else {
      this.setVelocity(0, 0);
      this.setScale(1, 1);
    }
    // Start a charge when the player wanders into range (telegraph resolves above).
    if (this.def.charge && this.chargeCd <= 0 && d < this.def.charge.range) {
      this.chargeWindupT = this.def.charge.windup;
      this.setTint(WINDUP_TINT);
    }
    // Contact attack (chargers dash instead; exploders detonate instead).
    if (!this.def.charge && !this.def.explode && d < CONTACT_RANGE && this.atkCd <= 0) {
      this.atkCd = ENEMY_ATTACK_COOLDOWN;
      this.windupT = CONTACT_WINDUP;
      this.setTint(WINDUP_TINT);
    }
    // Ranged (m2.4): loose a projectile toward the player from range.
    const ranged = this.def.ranged;
    if (ranged && this.rangedCd <= 0 && d <= ranged.range && d > 2) {
      this.rangedCd = ranged.cooldown;
      this.scene.events.emit('enemy-shoot', {
        x: this.x,
        y: this.y,
        angle: Math.atan2(player.y - this.y, player.x - this.x),
        speed: ranged.projectileSpeed,
        damage: ranged.damage * this.dmgMult,
      });
    }
    // Exploder (m2.4): within range, arm a telegraph then self-destruct in an AoE.
    const explode = this.def.explode;
    if (explode) {
      if (this.explodePendingT > 0) {
        this.explodePendingT -= dt;
        if (this.explodePendingT <= 0) {
          if (d < explode.radius) this.hitPlayer(player, explode.damage, numbers);
          this.spawnRing(explode.radius, SLAM_WINDUP);
          this.die();
          return;
        }
      } else if (d < explode.range) {
        this.explodePendingT = explode.windup;
        this.setTint(0xff5030);
        this.spawnRing(explode.radius, explode.windup);
      }
    }
    // Summoner (m2.4): periodically call minions (the scene enforces the cap).
    const summon = this.def.summon;
    if (summon) {
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = summon.interval;
        this.scene.events.emit('enemy-summon', summon, this.x, this.y);
      }
    }
    // Data-driven AoE ground slam (prototype: Rotfang every 4.5s). The ring is
    // the area indicator; the blow lands only after the slam windup.
    const slam = this.def.slam;
    if (slam) {
      if (this.slamPendingT > 0) {
        this.slamPendingT -= dt;
        if (this.slamPendingT <= 0 && d < slam.radius) {
          this.receiveThorns(this.hitPlayer(player, slam.damage, numbers), numbers);
        }
      }
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = slam.interval;
        this.spawnRing(slam.radius, SLAM_WINDUP);
        this.slamPendingT = SLAM_WINDUP;
      }
    }
    this.positionHpBar();
  }

  /** Area telegraph ring that fades over `seconds` (slam + explode indicator). */
  private spawnRing(radius: number, seconds: number): void {
    const ring = this.scene.add
      .image(this.x, this.y, 'ring')
      .setDepth(7)
      .setScale((radius * 2) / 64);
    this.scene.tweens.add({ targets: ring, alpha: 0, duration: seconds * 1000, onComplete: () => ring.destroy() });
  }

  /** Deals `base` damage to the player, scaled by this enemy's corruption mult. */
  private hitPlayer(player: Player, base: number, numbers: DamageNumbers): number {
    return player.takeDamage(base * this.dmgMult, numbers);
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
      numbers.spawn(this.x, this.y, amount, color, 'dot');
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

  /** Shoves this enemy directly away from (srcX, srcY) for a brief moment. */
  knockback(srcX: number, srcY: number, force: number): void {
    const dx = this.x - srcX;
    const dy = this.y - srcY;
    const d = Math.hypot(dx, dy) || 1;
    this.setVelocity((dx / d) * force, (dy / d) * force);
    this.knockT = 0.1;
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
    numbers.spawn(this.x, this.y, amount, hit.crit ? '#ffd84a' : '#ffffff', hit.crit ? 'crit' : 'normal');
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => this.clearTint());
    if (this.hp <= 0) this.die();
    return amount;
  }

  private die(): void {
    if (!this.active) return; // already dying — never award a kill twice
    this.scene.events.emit('enemy-died', this.def, this.x, this.y);
    // Become a non-interactive corpse (combat loops all gate on `active`),
    // then splat-fade instead of vanishing instantly.
    this.setActive(false);
    this.setVelocity(0, 0);
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 0.5,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => this.destroy(),
    });
  }
}
