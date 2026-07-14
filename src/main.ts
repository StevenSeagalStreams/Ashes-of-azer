import Phaser from 'phaser';

class PlaceholderScene extends Phaser.Scene {
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

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#1a1423',
  pixelArt: true,
  scene: [PlaceholderScene],
});
