import Phaser from 'phaser';
import type { Element } from '../data/schemas/index.ts';
import { fanAngles, nearestTarget } from '../systems/projectiles.ts';
import type { Enemy } from './Enemy.ts';

export interface ProjectileConfig {
  x: number;
  y: number;
  angle: number; // radians
  speed: number;
  radius: number;
  lifetime: number;
  damage: number;
  pierce: number;
  chain: number;
  chainRange: number;
  split: number; // fan of extra projectiles spawned on first hit
  element: Element;
  burn?: { dps: number; duration: number };
  chill?: { pct: number; duration: number };
  color: number;
}

interface Live extends ProjectileConfig {
  active: boolean;
  t: number;
  hasHit: boolean;
  hitIds: Set<number>;
  gfx: Phaser.GameObjects.Arc;
}

/** Hooks the pool calls back into the scene for damage + element application. */
export interface ProjectileHooks {
  enemies: () => Enemy[];
  damage: (e: Enemy, amount: number) => void;
}

const ELEMENT_COLOR: Record<Element, number> = {
  none: 0xc88af5,
  fire: 0xe07830,
  frost: 0x7fa8ee,
};

/**
 * Fixed-size pool of projectiles (CLAUDE.md: pool projectiles from the start).
 * Movement, collision, pierce, chain and split all live here; the scene only
 * supplies the enemy list and a damage callback.
 */
export class ProjectilePool {
  private readonly pool: Live[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly hooks: ProjectileHooks,
    capacity = 128,
  ) {
    for (let i = 0; i < capacity; i++) {
      const gfx = scene.add.circle(0, 0, 3, 0xffffff).setDepth(7).setActive(false).setVisible(false);
      this.pool.push(this.blank(gfx));
    }
  }

  private blank(gfx: Phaser.GameObjects.Arc): Live {
    return {
      active: false,
      t: 0,
      hasHit: false,
      hitIds: new Set(),
      gfx,
      x: 0,
      y: 0,
      angle: 0,
      speed: 0,
      radius: 0,
      lifetime: 0,
      damage: 0,
      pierce: 0,
      chain: 0,
      chainRange: 0,
      split: 0,
      element: 'none',
      color: 0xffffff,
    };
  }

  activeCount(): number {
    return this.pool.filter((p) => p.active).length;
  }

  fire(cfg: ProjectileConfig): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return; // pool exhausted — drop the shot rather than allocate
    Object.assign(p, cfg);
    p.active = true;
    p.t = 0;
    p.hasHit = false;
    p.hitIds = new Set();
    const color = cfg.color || ELEMENT_COLOR[cfg.element];
    p.color = color;
    p.gfx
      .setPosition(cfg.x, cfg.y)
      .setRadius(cfg.radius > 4 ? 4 : cfg.radius)
      .setFillStyle(color)
      .setActive(true)
      .setVisible(true);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.lifetime) {
        this.retire(p);
        continue;
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      p.gfx.setPosition(p.x, p.y);

      for (const e of this.hooks.enemies()) {
        if (!e.active || p.hitIds.has(e.eid)) continue;
        if (Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) > p.radius + Math.max(e.def.width, e.def.height) / 2)
          continue;
        this.onHit(p, e);
        if (!p.active) break;
      }
    }
  }

  private onHit(p: Live, e: Enemy): void {
    p.hitIds.add(e.eid);
    this.hooks.damage(e, p.damage);
    if (p.element === 'fire' && p.burn) e.applyBurn(p.burn.dps, p.burn.duration);
    if (p.element === 'frost' && p.chill) e.applyChill(p.chill.pct, p.chill.duration);

    // Split once, on the first enemy struck.
    if (!p.hasHit && p.split > 0) {
      for (const a of fanAngles(p.angle, p.split + 1, 0.9)) {
        if (a === p.angle) continue;
        this.fire({ ...this.cfgOf(p), x: p.x, y: p.y, angle: a, split: 0, damage: p.damage * 0.6 });
      }
    }
    p.hasHit = true;

    if (p.pierce > 0) {
      p.pierce -= 1;
      return; // keep flying straight through
    }
    if (p.chain > 0) {
      const next = nearestTarget(
        { x: p.x, y: p.y },
        this.hooks.enemies().filter((q) => q.active).map((q) => ({ id: q.eid, x: q.x, y: q.y })),
        p.hitIds,
        p.chainRange,
      );
      if (next) {
        p.chain -= 1;
        p.angle = Math.atan2(next.y - p.y, next.x - p.x);
        return;
      }
    }
    this.retire(p);
  }

  private cfgOf(p: Live): ProjectileConfig {
    return {
      x: p.x,
      y: p.y,
      angle: p.angle,
      speed: p.speed,
      radius: p.radius,
      lifetime: p.lifetime,
      damage: p.damage,
      pierce: p.pierce,
      chain: p.chain,
      chainRange: p.chainRange,
      split: p.split,
      element: p.element,
      burn: p.burn,
      chill: p.chill,
      color: p.color,
    };
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
