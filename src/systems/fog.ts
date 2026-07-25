// Fog of war, ported from the prototype's draw() fog block:
// radial gradient centred on the player; sight radius grows with +Vision
// gear; dungeons are darker and tighter.

export const FOG_COLOR = 0x080610; // rgba(8,6,16,*) in the prototype

export interface FogParams {
  radius: number;
  darkness: number;
}

// Prototype: base = dark ? 62 : 100; R = base + vision; dark = dark ? 0.95 : 0.82
export const fogParams = (isDarkZone: boolean, visionBonus: number): FogParams => ({
  radius: (isDarkZone ? 62 : 100) + visionBonus,
  darkness: isDarkZone ? 0.95 : 0.82,
});

// Erase-brush with the prototype's gradient geometry: fully clear inside
// 0.45R, fading so the remaining fog is darkness*0.7 at the 0.8 stop, and
// untouched at R. (Erase removes dst alpha proportionally to brush alpha.)
export function addFogBrushTexture(scene: Phaser.Scene, key: string, radius: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  const grad = g.createRadialGradient(radius, radius, radius * 0.45, radius, radius, radius);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  scene.textures.addCanvas(key, c);
}

const BRUSH_KEY = 'fog-brush';

// A screen-space dark overlay (scrollFactor 0) re-filled each frame and then
// erased with the sight brush at the player's screen position. Uses a single
// RenderTexture + one brush texture, so per-frame cost is O(1) regardless of
// entity count — the roadmap's "test performance early" concern.
export class FogOfWar {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Image;
  private params: FogParams;

  constructor(scene: Phaser.Scene, isDarkZone: boolean, visionBonus: number) {
    this.params = fogParams(isDarkZone, visionBonus);
    addFogBrushTexture(scene, BRUSH_KEY, this.params.radius);
    // Brush kept out of the display list; only used as an erase stamp.
    this.brush = scene.make.image({ key: BRUSH_KEY }, false).setOrigin(0.5);
    this.rt = scene.add
      .renderTexture(0, 0, scene.scale.width, scene.scale.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** Rebuild the brush when the sight radius changes (e.g. +Vision gear). */
  refresh(scene: Phaser.Scene, isDarkZone: boolean, visionBonus: number): void {
    this.params = fogParams(isDarkZone, visionBonus);
    addFogBrushTexture(scene, BRUSH_KEY, this.params.radius);
  }

  update(screenX: number, screenY: number): void {
    this.rt.clear();
    this.rt.fill(FOG_COLOR, this.params.darkness);
    this.rt.erase(this.brush, screenX, screenY);
  }

  destroy(): void {
    this.rt.destroy();
    this.brush.destroy();
  }
}
