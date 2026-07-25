import Phaser from 'phaser';

// Enemy projectiles (m2.4 ranged pattern). The player's ProjectilePool hits
// enemies; this is its mirror — a small pool of straight shots that fly toward
// where the player was and damage the player on contact. Deliberately simple:
// no pierce/chain/split (those are the player's build fantasy, not the mob's).

export interface EnemyShot {
  x: number;
  y: number;
  angle: number; // radians
  speed: number;
  damage: number;
  color?: number;
}

interface Live extends EnemyShot {
  active: boolean;
  t: number;
  gfx: Phaser.GameObjects.Arc;
}

/** Scene hooks: where the player is (null if dead/gone) and how to hurt them. */
export interface EnemyProjectileHooks {
  playerPos: () => { x: number; y: number } | null;
  hit: (amount: number) => void;
}

const LIFETIME = 3; // seconds before a missed shot retires
const HIT_RADIUS = 8; // player hitbox for shot collision

export class EnemyProjectilePool {
  private readonly pool: Live[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly hooks: EnemyProjectileHooks,
    capacity = 48,
  ) {
    for (let i = 0; i < capacity; i++) {
      const gfx = scene.add.circle(0, 0, 3, 0xe0603a).setDepth(7).setActive(false).setVisible(false);
      this.pool.push({ active: false, t: 0, x: 0, y: 0, angle: 0, speed: 0, damage: 0, gfx });
    }
  }

  activeCount(): number {
    return this.pool.filter((p) => p.active).length;
  }

  fire(shot: EnemyShot): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return; // pool exhausted — drop the shot rather than allocate
    Object.assign(p, shot);
    p.active = true;
    p.t = 0;
    p.gfx
      .setPosition(shot.x, shot.y)
      .setFillStyle(shot.color ?? 0xe0603a)
      .setActive(true)
      .setVisible(true);
  }

  update(dt: number): void {
    const player = this.hooks.playerPos();
    for (const p of this.pool) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= LIFETIME) {
        this.retire(p);
        continue;
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      p.gfx.setPosition(p.x, p.y);
      if (player && Phaser.Math.Distance.Between(player.x, player.y, p.x, p.y) <= HIT_RADIUS) {
        this.hooks.hit(p.damage);
        this.retire(p);
      }
    }
  }

  private retire(p: Live): void {
    p.active = false;
    p.gfx.setActive(false).setVisible(false);
  }

  destroy(): void {
    for (const p of this.pool) p.gfx.destroy();
    this.pool.length = 0;
  }
}
