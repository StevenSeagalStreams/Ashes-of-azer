import Phaser from 'phaser';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Ashes of Azer', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e8b64c',
      })
      .setOrigin(0.5);
  }
}
