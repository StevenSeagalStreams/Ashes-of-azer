import Phaser from 'phaser';
import type { Element } from '../data/schemas/index.ts';
import type { Enemy } from './Enemy.ts';

export interface TrapConfig {
  x: number;
  y: number;
  radius: number; // trigger + blast radius
  armTime: number; // seconds before it can trigger
  lifetime: number; // despawns if never triggered
  damage: number; // dealt to every enemy in the blast on trigger
  element: Element;
  stun?: number; // seconds of stun on trigger
  burn?: { dps: number; duration: number };
  chill?: { pct: number; duration: number };
  color: number;
}

interface Live extends TrapConfig {
  active: boolean;
  t: number;
  armed: boolean;
  gfx: Phaser.GameObjects.Arc;
}

export interface TrapHooks {
  enemies: () => Enemy[];
  damage: (e: Enemy, amount: number) => void;
}

/**
 * Placed traps (Hunter). A trap arms after `armTime`, then detonates the moment
 * any enemy steps inside its radius — dealing its damage (and element/stun) to
 * everything in the blast — or fizzles after `lifetime` if nothing trips it.
 * Few exist at once, so this is a small managed list, not a large pool.
 */
export class TrapPool {
  private readonly items: Live[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: TrapHooks,
  ) {}

  activeCount(): number {
    return this.items.filter((i) => i.active).length;
  }

  spawn(cfg: TrapConfig): void {
    const gfx = this.scene.add.circle(cfg.x, cfg.y, cfg.radius, cfg.color, 0.15).setDepth(2);
    gfx.setStrokeStyle(1, cfg.color, 0.8);
    this.items.push({ ...cfg, active: true, t: 0, armed: false, gfx });
  }

  update(dt: number): void {
    for (const trap of this.items) {
      if (!trap.active) continue;
      trap.t += dt;
      if (!trap.armed) {
        if (trap.t >= trap.armTime) {
          trap.armed = true;
          trap.gfx.setFillStyle(trap.color, 0.28); // solidify once live
        }
        continue;
      }
      if (trap.t >= trap.lifetime) {
        this.retire(trap);
        continue;
      }
      if (this.enemiesInside(trap).length > 0) this.detonate(trap);
    }
  }

  private detonate(trap: Live): void {
    for (const e of this.enemiesInside(trap)) {
      this.hooks.damage(e, trap.damage);
      if (trap.stun) e.applyStun(trap.stun);
      if (trap.element === 'fire' && trap.burn) e.applyBurn(trap.burn.dps, trap.burn.duration);
      if (trap.element === 'frost' && trap.chill) e.applyChill(trap.chill.pct, trap.chill.duration);
    }
    this.retire(trap);
  }

  private enemiesInside(trap: Live): Enemy[] {
    return this.hooks
      .enemies()
      .filter((e) => e.active && Phaser.Math.Distance.Between(e.x, e.y, trap.x, trap.y) <= trap.radius);
  }

  private retire(trap: Live): void {
    trap.active = false;
    trap.gfx.destroy();
  }

  destroy(): void {
    for (const t of this.items) t.gfx.destroy();
    this.items.length = 0;
  }
}
