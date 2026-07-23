import Phaser from 'phaser';
import type { ClassId } from '../data/schemas/index.ts';
import { defaultSave } from '../systems/save/schema.ts';
import { SaveStore } from '../systems/save/store.ts';

// New-game class picker, reached from the Title menu's "New Game". UI is an
// HTML/CSS overlay (CLAUDE.md: UI overlay is DOM, not canvas) styled after the
// prototype's parchment panels, to match SkillUI. Writes the chosen class into
// a fresh slot-1 save, then hands off to the World. Back returns to the Title;
// if a save already exists, choosing a class asks before overwriting it.

const ACTIVE_SLOT = 1;
const STYLE_ID = 'azer-classsel-style';

const CSS = `
  #azer-classsel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:14px;background:rgba(20,15,25,.78);font-family:"Courier New",monospace;
    color:#2b2033;z-index:40;}
  #azer-classsel h1{font-size:22px;color:#f7efd8;text-shadow:2px 2px 0 #000;letter-spacing:2px;margin:0;}
  #azer-classsel .sub{font-size:11px;color:#c8b48a;margin:-6px 0 4px;}
  #azer-classsel .cards{display:flex;gap:14px;}
  .azer-class{width:180px;background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:12px;
    text-align:center;box-shadow:0 6px 0 rgba(0,0,0,.4);cursor:pointer;transition:transform .08s;}
  .azer-class:hover{transform:translateY(-3px);border-color:#e8b64c;}
  .azer-class .ico{font-size:40px;line-height:48px;}
  .azer-class h2{font-size:15px;margin:4px 0;letter-spacing:1px;}
  .azer-class p{font-size:10px;color:#5a4a30;margin:6px 0 0;line-height:1.4;}
  .azer-class.soon{opacity:.5;cursor:not-allowed;}
  .azer-class.soon:hover{transform:none;border-color:#8a6d3b;}
  .azer-class .tag{display:inline-block;margin-top:8px;font-size:9px;font-weight:bold;color:#8a6d3b;
    border:2px solid #8a6d3b;border-radius:4px;padding:1px 6px;}
  #azer-classsel .back{font-family:inherit;font-size:11px;font-weight:bold;color:#f7efd8;background:none;
    border:2px solid #8a6d3b;border-radius:6px;padding:5px 14px;cursor:pointer;margin-top:6px;letter-spacing:1px;}
  #azer-classsel .back:hover{border-color:#e8b64c;}
  #azer-classsel .confirm{font-size:11px;color:#ffd84a;background:rgba(0,0,0,.55);padding:4px 12px;
    border-radius:8px;min-height:16px;text-align:center;}
`;

interface ClassOption {
  id: ClassId;
  icon: string;
  name: string;
  blurb: string;
  playable: boolean;
}

const OPTIONS: ClassOption[] = [
  {
    id: 'warrior',
    icon: '🛡',
    name: 'Warrior',
    blurb: 'Melee bruiser. Shouts, charges, and bleeds. Sustains with mana generators, lifesteal, and thorns.',
    playable: true,
  },
  {
    id: 'mage',
    icon: '🔮',
    name: 'Mage',
    blurb: 'Ranged caster. Hurls fire, frost, and arcane bolts; kites with Blink and burning, freezing ground.',
    playable: true,
  },
  {
    id: 'hunter',
    icon: '🏹',
    name: 'Hunter',
    blurb: 'Ranged skirmisher. Rains arrows and multi-shots, lays traps, and fights beside a summoned wolf.',
    playable: true,
  },
];

export class ClassSelectScene extends Phaser.Scene {
  private overlay?: HTMLElement;
  // Which class is awaiting a confirming second click (overwrite guard).
  private pendingClass: ClassId | null = null;

  constructor() {
    super('ClassSelect');
  }

  init(): void {
    this.pendingClass = null; // reset when re-entered from the Title menu
  }

  create(): void {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'azer-classsel';
    overlay.innerHTML = `
      <h1>ASHES OF AZER</h1>
      <div class="sub">Choose your class</div>
      <div class="cards"></div>
      <div class="confirm"></div>
      <button class="back">← BACK</button>
    `;
    const cards = overlay.querySelector('.cards') as HTMLElement;
    for (const opt of OPTIONS) {
      const card = document.createElement('div');
      card.className = `azer-class${opt.playable ? '' : ' soon'}`;
      card.innerHTML = `
        <div class="ico">${opt.icon}</div>
        <h2>${opt.name}</h2>
        <p>${opt.blurb}</p>
        ${opt.playable ? '' : '<span class="tag">COMING SOON</span>'}
      `;
      if (opt.playable) card.addEventListener('click', () => this.pick(opt.id, opt.name));
      cards.appendChild(card);
    }
    (overlay.querySelector('.back') as HTMLElement).addEventListener('click', () => {
      this.teardown();
      this.scene.start('Title');
    });
    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Guarantee teardown if the scene ever restarts or is stopped externally.
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
  }

  /**
   * First click on a class when a save exists asks for confirmation (a new
   * game overwrites the single save slot); a second click on the same class
   * commits. With no existing save, the first click commits immediately.
   */
  private pick(classId: ClassId, name: string): void {
    const confirmEl = this.overlay?.querySelector('.confirm') as HTMLElement | undefined;
    if (this.hasExistingSave() && this.pendingClass !== classId) {
      this.pendingClass = classId;
      if (confirmEl) confirmEl.textContent = `Start a new ${name}? This replaces your current save — click ${name} again to confirm.`;
      return;
    }
    this.commit(classId);
  }

  /** True if slot 1 holds any save; a corrupt save counts (it'd be overwritten). */
  private hasExistingSave(): boolean {
    const store = new SaveStore(window.localStorage);
    try {
      return store.load(ACTIVE_SLOT) !== null;
    } catch {
      return true;
    }
  }

  private commit(classId: ClassId): void {
    const store = new SaveStore(window.localStorage);
    const save = defaultSave();
    save.character.class = classId;
    store.save(ACTIVE_SLOT, save);
    this.teardown();
    this.scene.start('World');
    this.scene.launch('UI');
  }

  private teardown(): void {
    this.overlay?.remove();
    this.overlay = undefined;
  }
}
