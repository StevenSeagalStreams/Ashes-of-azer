import Phaser from 'phaser';

interface Hud {
  hp: number;
  maxHp: number;
  dead: boolean;
}

const BAR_X = 12;
const BAR_Y = 12;
const BAR_W = 120;
const BAR_H = 10;

// HUD overlay. Reads player state from the game registry (published by
// WorldScene) so the two scenes stay decoupled. MP/XP bars arrive with the
// skill/level systems (Milestones 1.1 / 1.x); only HP exists in 0.2.
export class UIScene extends Phaser.Scene {
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private deathOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super('UI');
  }

  create(): void {
    this.add.rectangle(BAR_X, BAR_Y, BAR_W, BAR_H, 0x000000, 0.55).setOrigin(0, 0);
    this.hpFill = this.add.rectangle(BAR_X, BAR_Y, BAR_W, BAR_H, 0xe4574f).setOrigin(0, 0);
    this.add
      .rectangle(BAR_X, BAR_Y, BAR_W, BAR_H)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2b2033);
    this.hpText = this.add
      .text(BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.deathOverlay = this.buildDeathOverlay().setVisible(false);
  }

  override update(): void {
    const hud = this.registry.get('hud') as Hud | undefined;
    if (!hud) return;
    const frac = Phaser.Math.Clamp(hud.maxHp > 0 ? hud.hp / hud.maxHp : 0, 0, 1);
    this.hpFill.setScale(frac, 1);
    this.hpText.setText(`${Math.ceil(hud.hp)} / ${hud.maxHp}`);
    this.deathOverlay.setVisible(hud.dead);
  }

  private buildDeathOverlay(): Phaser.GameObjects.Container {
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.rectangle(0, 0, w, h, 0x400000, 0.55).setOrigin(0, 0);
    const title = this.add
      .text(w / 2, h / 2 - 12, 'YOU DIED', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(w / 2, h / 2 + 14, 'The relics whisper... press R to rise again.', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f2c9a0',
      })
      .setOrigin(0.5);
    return this.add.container(0, 0, [bg, title, hint]).setDepth(200);
  }
}
