import Phaser from 'phaser';
import type { Element } from '../data/schemas/index.ts';
import type { Enemy } from './Enemy.ts';

export interface GroundEffectConfig {
  x: number;
  y: number;
  radius: number;
  duration: number;
  tickDps: number;
  element: Element;
  chillPct?: number;
  burnDps?: number;
  delay?: number; // telegraph before it activates (Meteor)
  burst?: number; // one-off impact damage when it lands
  color: number;
}

interface Live extends GroundEffectConfig {
  active: boolean;
  t: number; // elapsed since spawn
  tickT: number;
  landed: boolean;
  gfx: Phaser.GameObjects.Arc;
}

export interface GroundEffectHooks {
  enemies: () => Enemy[];
  damage: (e: Enemy, amount: number) => void;
}

/**
 * Persistent ground patches (Flame Wall, Blizzard, Meteor). Few are active at
 * once, so this is a small managed list rather than a large pool. Ticks
 * damage ~2/s to enemies inside and applies the patch's element.
 */
export class GroundEffectPool {
  private readonly items: Live[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: GroundEffectHooks,
  ) {}

  activeCount(): number {
    return this.items.filter((i) => i.active).length;
  }

  spawn(cfg: GroundEffectConfig): void {
    const gfx = this.scene.add
      .circle(cfg.x, cfg.y, cfg.radius, cfg.color, cfg.delay ? 0.15 : 0.28)
      .setDepth(2);
    this.items.push({ ...cfg, active: true, t: 0, tickT: 0, landed: !cfg.delay, gfx });
  }

  update(dt: number): void {
    for (const g of this.items) {
      if (!g.active) continue;
      g.t += dt;
      // Telegraph phase (Meteor): wait, then land with a burst.
      if (!g.landed) {
        if (g.t >= (g.delay ?? 0)) {
          g.landed = true;
          g.gfx.setFillStyle(g.color, 0.28);
          if (g.burst) for (const e of this.enemiesInside(g)) this.hooks.damage(e, g.burst);
        }
        continue;
      }
      g.tickT -= dt;
      if (g.tickT <= 0) {
        g.tickT = 0.5;
        for (const e of this.enemiesInside(g)) {
          this.hooks.damage(e, Math.round(g.tickDps * 0.5));
          if (g.element === 'frost' && g.chillPct) e.applyChill(g.chillPct, 1.2);
          if (g.element === 'fire' && g.burnDps) e.applyBurn(g.burnDps, 2);
        }
      }
      if (g.t >= (g.delay ?? 0) + g.duration) {
        g.active = false;
        g.gfx.destroy();
      }
    }
  }

  private enemiesInside(g: Live): Enemy[] {
    return this.hooks.enemies().filter((e) => e.active && Phaser.Math.Distance.Between(e.x, e.y, g.x, g.y) <= g.radius);
  }

  destroy(): void {
    for (const g of this.items) g.gfx.destroy();
    this.items.length = 0;
  }
}
