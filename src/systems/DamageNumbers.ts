import Phaser from 'phaser';

// Pooled floating combat text (CLAUDE.md: pool damage numbers from the start).
// `kind` (m1.6 pass) styles the pop: crits are big and punchy, DoT ticks are
// small and quick, damage the player takes reads in aggressive red.
export type NumberKind = 'normal' | 'crit' | 'dot' | 'player';

const SIZE: Record<NumberKind, number> = { normal: 8, crit: 13, dot: 6, player: 10 };
const RISE: Record<NumberKind, number> = { normal: 24, crit: 34, dot: 16, player: 24 };
const DURATION: Record<NumberKind, number> = { normal: 1300, crit: 1300, dot: 850, player: 1100 };

export class DamageNumbers {
  private readonly pool: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(x: number, y: number, value: number | string, color: string, kind: NumberKind = 'normal'): void {
    const t =
      this.pool.pop() ??
      this.scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(10);
    t.setFontSize(SIZE[kind]);
    t.setText(String(value)).setColor(color).setStroke('#000000', kind === 'crit' ? 3 : 2);
    t.setPosition(x, y - 8).setAlpha(1).setScale(1).setVisible(true).setActive(true);
    // Crits punch in from oversized; DoT/normal just float.
    if (kind === 'crit') {
      t.setScale(1.6);
      this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    }
    this.scene.tweens.add({
      targets: t,
      y: y - 8 - RISE[kind],
      alpha: 0,
      duration: DURATION[kind],
      onComplete: () => {
        t.setVisible(false).setActive(false);
        this.pool.push(t);
      },
    });
  }
}
