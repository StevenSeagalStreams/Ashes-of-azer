import Phaser from 'phaser';
import { inHazard } from '../systems/hazards.ts';

// World-boss ground hazards (m4.x). A pooled set of lingering damage pools: each
// telegraphs (a pulsing outline, no damage) so the player can read where NOT to
// stand, then goes active (filled pool) and ticks damage to a player caught in
// it. Pooled from the start like projectiles/particles — no per-cast allocation.

export interface HazardConfig {
  telegraph: number; // seconds of warning before it deals damage
  damage: number; // damage per 0.5s tick while a player stands in it
  radius: number;
  duration: number; // seconds the active pool lasts
}

export interface HazardHooks {
  playerPos: () => { x: number; y: number } | null;
  hit: (amount: number) => void;
}

interface Live {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  damage: number;
  telegraphT: number;
  activeT: number;
  tickT: number;
  gfx: Phaser.GameObjects.Arc;
}

const TICK = 0.5; // damage cadence while standing in an active pool

export class HazardField {
  private readonly pool: Live[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly hooks: HazardHooks,
    capacity = 24,
  ) {
    for (let i = 0; i < capacity; i++) {
      const gfx = scene.add.circle(0, 0, 4, 0x9a5ad0, 0.18).setDepth(3).setActive(false).setVisible(false);
      this.pool.push({ active: false, x: 0, y: 0, radius: 0, damage: 0, telegraphT: 0, activeT: 0, tickT: 0, gfx });
    }
  }

  activeCount(): number {
    return this.pool.filter((p) => p.active).length;
  }

  /** True if the player is currently standing in an active (past-telegraph) pool. */
  playerInActive(px: number, py: number): boolean {
    return this.pool.some((p) => p.active && p.telegraphT <= 0 && inHazard(px, py, p.x, p.y, p.radius));
  }

  spawn(x: number, y: number, cfg: HazardConfig): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return; // pool exhausted — drop it rather than allocate mid-fight
    p.active = true;
    p.x = x;
    p.y = y;
    p.radius = cfg.radius;
    p.damage = cfg.damage;
    p.telegraphT = cfg.telegraph;
    p.activeT = cfg.duration;
    p.tickT = 0;
    p.gfx
      .setPosition(x, y)
      .setRadius(cfg.radius)
      .setFillStyle(0x9a5ad0, 0.16)
      .setStrokeStyle(1.5, 0xc890ff, 0.9)
      .setActive(true)
      .setVisible(true);
  }

  update(dt: number): void {
    const player = this.hooks.playerPos();
    for (const p of this.pool) {
      if (!p.active) continue;
      if (p.telegraphT > 0) {
        // Telegraph: pulse the outline, deal no damage — a readable warning.
        p.telegraphT -= dt;
        const a = 0.1 + 0.14 * Math.abs(Math.sin(p.telegraphT * 12));
        p.gfx.setFillStyle(0x9a5ad0, a);
        if (p.telegraphT <= 0) p.gfx.setFillStyle(0xc23a7a, 0.34).setStrokeStyle(1.5, 0xff6ab0, 0.95); // arm it
        continue;
      }
      p.activeT -= dt;
      p.tickT -= dt;
      if (p.tickT <= 0) {
        p.tickT = TICK;
        if (player && inHazard(player.x, player.y, p.x, p.y, p.radius)) this.hooks.hit(p.damage);
      }
      // Fade the pool out over its final moments, then retire.
      p.gfx.setAlpha(Phaser.Math.Clamp(p.activeT / 0.6, 0.25, 1));
      if (p.activeT <= 0) this.retire(p);
    }
  }

  private retire(p: Live): void {
    p.active = false;
    p.gfx.setActive(false).setVisible(false).setAlpha(1);
  }

  /** Clears all live hazards (e.g. on the boss dying or a zone change). */
  clear(): void {
    for (const p of this.pool) if (p.active) this.retire(p);
  }

  destroy(): void {
    for (const p of this.pool) p.gfx.destroy();
    this.pool.length = 0;
  }
}
