import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { WorldScene } from './scenes/WorldScene.ts';
import { UIScene } from './scenes/UIScene.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#1a1423',
  pixelArt: true,
  scene: [BootScene, WorldScene, UIScene],
});
