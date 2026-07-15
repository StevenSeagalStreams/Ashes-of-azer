import Phaser from 'phaser';

// Pooled floating combat text (CLAUDE.md: pool damage numbers from the start).
export class DamageNumbers {
  private readonly pool: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(x: number, y: number, value: number | string, color: string): void {
    const t =
      this.pool.pop() ??
      this.scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(10);
    t.setText(String(value)).setColor(color).setStroke('#000000', 2);
    t.setPosition(x, y - 8).setAlpha(1).setVisible(true).setActive(true);
    this.scene.tweens.add({
      targets: t,
      y: y - 32,
      alpha: 0,
      duration: 1300,
      onComplete: () => {
        t.setVisible(false).setActive(false);
        this.pool.push(t);
      },
    });
  }
}
