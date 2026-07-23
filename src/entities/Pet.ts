import Phaser from 'phaser';
import { DamageNumbers } from '../systems/DamageNumbers.ts';
import { addSpriteTexture, spriteRowsFor } from '../systems/pixelart.ts';
import type { Enemy } from './Enemy.ts';
import type { Player } from './Player.ts';

export interface PetConfig {
  maxHp: number;
  damage: () => number; // resolved per hit so it tracks the player's buffs
  attackCooldown: number;
  speed: number;
  leashRange: number; // won't chase enemies further than this from the player
  respawnTime: number; // seconds to respawn after dying
}

export interface PetHooks {
  enemies: () => Enemy[];
  numbers: DamageNumbers;
}

const CONTACT = 18; // melee reach, both for the pet's bite and taking hits
const FOLLOW_GAP = 26; // starts trailing the player past this distance
const ENEMY_CONTACT_DPS_CD = 0.8; // how often an adjacent enemy chips the pet

/**
 * A summoned companion (Hunter). Follows the player, runs down the nearest
 * enemy within leash of the player and bites it, takes contact damage from
 * adjacent enemies, and — when its HP hits zero — dies and respawns at the
 * player's side after a cooldown. One pet per player; re-casting heals it.
 */
export class Pet extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  private cfg: PetConfig;
  private atkCd = 0;
  private hurtCd = 0;
  dead = false;
  private respawnT = 0;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: PetConfig, private readonly hooks: PetHooks) {
    addSpriteTexture(scene, 'petwolf', spriteRowsFor('petwolf'));
    super(scene, x, y, 'petwolf');
    this.cfg = cfg;
    this.hp = cfg.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setSize(12, 12);
    this.setDepth(4);
    this.hpBarBg = scene.add.rectangle(x, y, 12, 3, 0x000000, 0.65).setDepth(5);
    this.hpBarFg = scene.add.rectangle(x, y, 12, 3, 0x6ac06a).setDepth(6).setOrigin(0, 0.5);
  }

  /** Re-summon: full heal and warp to the player (used when re-cast). */
  resummon(player: Player, cfg: PetConfig): void {
    this.cfg = cfg;
    this.hp = cfg.maxHp;
    this.dead = false;
    this.respawnT = 0;
    this.setActive(true).setVisible(true);
    this.body?.reset(player.x, player.y);
    this.hpBarBg.setVisible(true);
    this.hpBarFg.setVisible(true);
  }

  updatePet(dt: number, player: Player): void {
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn(player);
      return;
    }
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);

    const target = this.pickTarget(player);
    if (target) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (d > CONTACT) {
        this.moveToward(target.x, target.y);
      } else {
        this.setVelocity(0, 0);
        if (this.atkCd <= 0) {
          this.atkCd = this.cfg.attackCooldown;
          target.takeHit({ amount: this.cfg.damage(), crit: false }, this.hooks.numbers);
        }
      }
    } else {
      // No quarry: heel to the player.
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (d > FOLLOW_GAP) this.moveToward(player.x, player.y);
      else this.setVelocity(0, 0);
    }

    this.takeContactDamage();
    this.positionHpBar();
  }

  /** Nearest active enemy that is within leash range of the player. */
  private pickTarget(player: Player): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.hooks.enemies()) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y) > this.cfg.leashRange) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private moveToward(tx: number, ty: number): void {
    const d = Phaser.Math.Distance.Between(this.x, this.y, tx, ty) || 1;
    this.setVelocity(((tx - this.x) / d) * this.cfg.speed, ((ty - this.y) / d) * this.cfg.speed);
  }

  private takeContactDamage(): void {
    if (this.hurtCd > 0) return;
    for (const e of this.hooks.enemies()) {
      if (!e.active || Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) > CONTACT) continue;
      this.hurtCd = ENEMY_CONTACT_DPS_CD;
      this.hp -= e.def.dmg;
      this.hooks.numbers.spawn(this.x, this.y, e.def.dmg, '#e4574f');
      if (this.hp <= 0) this.die();
      return; // one bite per intake window
    }
  }

  private die(): void {
    this.dead = true;
    this.respawnT = this.cfg.respawnTime;
    this.setActive(false).setVisible(false);
    this.setVelocity(0, 0);
    this.hpBarBg.setVisible(false);
    this.hpBarFg.setVisible(false);
  }

  private respawn(player: Player): void {
    this.dead = false;
    this.hp = this.cfg.maxHp;
    this.body?.reset(player.x, player.y);
    this.setActive(true).setVisible(true);
    this.hpBarBg.setVisible(true);
    this.hpBarFg.setVisible(true);
  }

  private positionHpBar(): void {
    const barY = this.y - this.height / 2 - 5;
    this.hpBarBg.setPosition(this.x, barY);
    this.hpBarFg.setPosition(this.x - 6, barY);
    this.hpBarFg.setScale(Phaser.Math.Clamp(this.hp / this.cfg.maxHp, 0, 1), 1);
  }

  destroyPet(): void {
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
    this.destroy();
  }
}
