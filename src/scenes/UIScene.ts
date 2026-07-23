import Phaser from 'phaser';

interface Hud {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  xpNext: number;
  level: number;
  dead: boolean;
  corruption: number;
  corruptionTier: string;
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
  private mpFill!: Phaser.GameObjects.Rectangle;
  private mpText!: Phaser.GameObjects.Text;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private corruptionFill!: Phaser.GameObjects.Rectangle;
  private corruptionText!: Phaser.GameObjects.Text;
  private deathOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super('UI');
  }

  private bar(y: number, h: number, color: number): Phaser.GameObjects.Rectangle {
    this.add.rectangle(BAR_X, y, BAR_W, h, 0x000000, 0.55).setOrigin(0, 0);
    const fill = this.add.rectangle(BAR_X, y, BAR_W, h, color).setOrigin(0, 0);
    this.add.rectangle(BAR_X, y, BAR_W, h).setOrigin(0, 0).setStrokeStyle(1, 0x2b2033);
    return fill;
  }

  private barText(y: number, h: number): Phaser.GameObjects.Text {
    return this.add
      .text(BAR_X + BAR_W / 2, y + h / 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' })
      .setOrigin(0.5);
  }

  create(): void {
    // Prototype HUD: hp / mp / xp bars stacked top-left.
    this.hpFill = this.bar(BAR_Y, BAR_H, 0xe4574f);
    this.hpText = this.barText(BAR_Y, BAR_H);
    this.mpFill = this.bar(BAR_Y + 13, BAR_H, 0x4a90d9);
    this.mpText = this.barText(BAR_Y + 13, BAR_H);
    this.xpFill = this.bar(BAR_Y + 26, 5, 0x9bd44a);
    this.levelText = this.add
      .text(BAR_X + BAR_W + 6, BAR_Y, '', { fontFamily: 'monospace', fontSize: '9px', color: '#e8b64c' })
      .setOrigin(0, 0);

    // Corruption dial (m3): a purple bar under the XP, with its tier name.
    this.corruptionFill = this.bar(BAR_Y + 34, 5, 0xb06ad0);
    this.corruptionText = this.add
      .text(BAR_X + BAR_W + 6, BAR_Y + 32, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c88af5' })
      .setOrigin(0, 0);

    this.deathOverlay = this.buildDeathOverlay().setVisible(false);
  }

  override update(): void {
    const hud = this.registry.get('hud') as Hud | undefined;
    if (!hud) return;
    const frac = (v: number, max: number): number => Phaser.Math.Clamp(max > 0 ? v / max : 0, 0, 1);
    this.hpFill.setScale(frac(hud.hp, hud.maxHp), 1);
    this.hpText.setText(`${Math.ceil(hud.hp)} / ${hud.maxHp}`);
    this.mpFill.setScale(frac(hud.mp, hud.maxMp), 1);
    this.mpText.setText(`${Math.floor(hud.mp)} / ${hud.maxMp}`);
    this.xpFill.setScale(frac(hud.xp, hud.xpNext), 1);
    this.levelText.setText(`Lv ${hud.level}`);
    this.corruptionFill.setScale(frac(hud.corruption, 100), 1);
    this.corruptionText.setText(`☣ ${hud.corruptionTier}`);
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
