import Phaser from 'phaser';
import type { ClassId } from '../data/schemas/index.ts';
import type { SaveData } from '../systems/save/schema.ts';
import { SaveStore } from '../systems/save/store.ts';

// Main menu, shown on every launch (BootScene routes here once data loads).
// Continue resumes the slot-1 save; New Game opens the class picker. DOM
// overlay per CLAUDE.md (UI is HTML/CSS, not canvas), styled to match
// ClassSelectScene / SkillUI. This is the m5.2 title menu pulled forward so a
// player with an existing save can still reach the class picker.

const ACTIVE_SLOT = 1;
const STYLE_ID = 'azer-title-style';

const CLASS_LABEL: Record<ClassId, string> = {
  warrior: 'Warrior',
  mage: 'Mage',
  hunter: 'Hunter',
};

const CSS = `
  #azer-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:12px;background:rgba(20,15,25,.82);font-family:"Courier New",monospace;
    color:#f7efd8;z-index:41;}
  #azer-title h1{font-size:26px;text-shadow:2px 2px 0 #000;letter-spacing:3px;margin:0;}
  #azer-title .sub{font-size:11px;color:#c8b48a;margin:-4px 0 10px;}
  #azer-title .menu{display:flex;flex-direction:column;gap:10px;align-items:stretch;min-width:220px;}
  .azer-menu-btn{font-family:inherit;font-size:14px;font-weight:bold;color:#2b2033;background:#f7efd8;
    border:4px solid #8a6d3b;border-radius:8px;padding:10px 16px;cursor:pointer;box-shadow:0 5px 0 rgba(0,0,0,.4);
    transition:transform .08s,border-color .08s;text-align:center;letter-spacing:1px;}
  .azer-menu-btn:hover{transform:translateY(-2px);border-color:#e8b64c;}
  .azer-menu-btn small{display:block;font-size:9px;font-weight:normal;color:#7a6a4a;letter-spacing:0;margin-top:2px;}
`;

export class TitleScene extends Phaser.Scene {
  private overlay?: HTMLElement;

  constructor() {
    super('Title');
  }

  create(): void {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const existing = this.loadExisting();

    const overlay = document.createElement('div');
    overlay.id = 'azer-title';
    overlay.innerHTML = `
      <h1>ASHES OF AZER</h1>
      <div class="sub">A bright-pixel ARPG</div>
      <div class="menu"></div>
    `;
    const menu = overlay.querySelector('.menu') as HTMLElement;

    if (existing) {
      const label = CLASS_LABEL[existing.character.class];
      const cont = document.createElement('button');
      cont.className = 'azer-menu-btn';
      cont.innerHTML = `CONTINUE<small>${label} · Level ${existing.character.level}</small>`;
      cont.addEventListener('click', () => this.continueGame());
      menu.appendChild(cont);
    }

    const neu = document.createElement('button');
    neu.className = 'azer-menu-btn';
    neu.innerHTML = existing
      ? 'NEW GAME<small>pick a class — replaces your save</small>'
      : 'NEW GAME<small>pick a class</small>';
    neu.addEventListener('click', () => this.newGame());
    menu.appendChild(neu);

    document.body.appendChild(overlay);
    this.overlay = overlay;

    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
  }

  /** The slot-1 save, or null if empty. A corrupt save still counts as
   *  "continuable" — the World recovers it — so we surface Continue for it. */
  private loadExisting(): SaveData | null {
    const store = new SaveStore(window.localStorage);
    try {
      return store.load(ACTIVE_SLOT);
    } catch {
      // Corrupt: no reliable class/level to show, so offer only New Game.
      return null;
    }
  }

  private continueGame(): void {
    this.teardown();
    this.scene.start('World');
    this.scene.launch('UI');
  }

  private newGame(): void {
    this.teardown();
    this.scene.start('ClassSelect');
  }

  private teardown(): void {
    this.overlay?.remove();
    this.overlay = undefined;
  }
}
