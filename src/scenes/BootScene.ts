import Phaser from 'phaser';
import { DataValidationError } from '../data/loader.ts';
import { loadGameData } from '../data/gameData.ts';

// The zones with authored maps. The one place map files are enumerated —
// a new zone adds its id here plus assets/maps/<id>.json + data/zones.json.
const MAP_ZONES = ['overworld', 'dungeon', 'town', 'forest', 'foresttown', 'forestdungeon', 'marsh'];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const zone of MAP_ZONES) {
      this.load.tilemapTiledJSON(`map-${zone}`, `maps/${zone}.json`);
    }
  }

  create(): void {
    try {
      const data = loadGameData();
      this.registry.set('gameData', data);
    } catch (err) {
      this.failLoudly(err);
      return;
    }
    // Always open on the Title menu: it offers Continue (load the save) or
    // New Game (pick a class), so a player with an existing save can still
    // reach the class picker.
    this.scene.start('Title');
  }

  /**
   * CLAUDE.md: the loader must "fail loudly on invalid data" — never fall
   * back to defaults or continue with partial content. Halts on a visible
   * error screen instead of starting the game.
   */
  private failLoudly(err: unknown): void {
    const message = err instanceof DataValidationError ? err.issues.join('\n') : String(err);
    console.error('Failed to load game data:', message);
    this.cameras.main.setBackgroundColor('#400000');
    this.add
      .text(this.scale.width / 2, 20, 'GAME DATA ERROR', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(this.scale.width / 2, 44, message, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffb0b0',
        align: 'center',
        wordWrap: { width: this.scale.width - 20 },
      })
      .setOrigin(0.5, 0);
  }
}
