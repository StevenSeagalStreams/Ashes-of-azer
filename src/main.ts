import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';
import { ClassSelectScene } from './scenes/ClassSelectScene.ts';
import { WorldScene } from './scenes/WorldScene.ts';
import { UIScene } from './scenes/UIScene.ts';

// 480x270 at 2x zoom matches the prototype's canvas (480x270 CSS-scaled to
// 960x540), so all ported tuning values (speeds, radii) stay 1:1.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 270,
  zoom: 2,
  backgroundColor: '#1a1423',
  pixelArt: true,
  physics: {
    default: 'arcade',
  },
  scene: [BootScene, TitleScene, ClassSelectScene, WorldScene, UIScene],
});
