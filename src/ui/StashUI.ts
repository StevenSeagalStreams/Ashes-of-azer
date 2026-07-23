import type { AffixesFile } from '../data/schemas/index.ts';
import type { ItemInstance } from '../systems/save/schema.ts';

// Shared storage chest (Milestone 2.3). DOM per CLAUDE.md. Two columns — your
// Bag and the Stash — click an item to move it across. Hover for a rarity-
// colored affix tooltip. Opened by a `service: 'stash'` NPC.

export interface StashUIHost {
  affixes: AffixesFile;
  bag: () => ItemInstance[];
  stash: () => ItemInstance[];
  toStash: (bagIndex: number) => void;
  toBag: (stashIndex: number) => void;
}

const RARITY_HEX: Record<string, string> = {
  white: '#f4f0e0',
  magic: '#7fa8ee',
  rare: '#e8b64c',
  epic: '#c88af5',
  legendary: '#e07830',
};

const STYLE_ID = 'azer-stash-ui-style';
const CSS = `
  #azer-stash{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:420px;max-width:94%;max-height:460px;
    overflow-y:auto;background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-stash h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 6px;letter-spacing:1px;}
  #azer-stash .cols{display:flex;gap:10px;}
  #azer-stash .col{flex:1;min-width:0;}
  #azer-stash h5{font-size:10px;color:#7a6a4a;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;}
  #azer-stash .row{border:2px solid #8a6d3b;border-radius:4px;padding:4px 6px;margin-bottom:4px;
    background:rgba(255,255,255,.5);font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #azer-stash .empty{font-size:10px;color:#7a6a4a;font-style:italic;}
  #azer-stash-tip{position:absolute;pointer-events:none;z-index:60;background:#241a30;border:2px solid #8a6d3b;
    border-radius:6px;padding:6px 8px;font-family:"Courier New",monospace;font-size:11px;color:#e8e0cc;
    max-width:200px;display:none;box-shadow:0 4px 0 rgba(0,0,0,.4);}
  #azer-stash-tip .nm{font-weight:bold;font-size:12px;}
  #azer-stash-tip .sub{color:#a89878;font-size:9px;margin-bottom:3px;}
  #azer-stash-tip .aff{color:#8bd06a;}
`;

export class StashUI {
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private open = false;

  constructor(private readonly host: StashUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.panel = document.createElement('div');
    this.panel.id = 'azer-stash';
    this.tip = document.createElement('div');
    this.tip.id = 'azer-stash-tip';
    app.append(this.panel, this.tip);
  }

  isOpen(): boolean {
    return this.open;
  }

  openStash(): void {
    this.open = true;
    this.panel.style.display = 'block';
    this.render();
  }

  close(): void {
    this.open = false;
    this.panel.style.display = 'none';
    this.tip.style.display = 'none';
  }

  refresh(): void {
    if (this.open) this.render();
  }

  private render(): void {
    const bag = this.host.bag();
    const stash = this.host.stash();
    const list = (items: ItemInstance[], attr: string, hint: string): string =>
      items.length
        ? items
            .map(
              (item, i) =>
                `<div class="row" ${attr}="${i}" title="${hint}" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${item.name}</div>`,
            )
            .join('')
        : '<div class="empty">empty</div>';

    this.panel.innerHTML = `<h3>STASH</h3><div class="cols"><div class="col"><h5>Bag → Stash</h5>${list(bag, 'data-tostash', 'store')}</div><div class="col"><h5>Stash → Bag</h5>${list(stash, 'data-tobag', 'take')}</div></div>`;

    this.panel.querySelectorAll<HTMLElement>('[data-tostash]').forEach((el) => {
      const i = Number(el.dataset['tostash']);
      el.addEventListener('click', () => this.host.toStash(i));
      this.attachTip(el, bag[i]!);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-tobag]').forEach((el) => {
      const i = Number(el.dataset['tobag']);
      el.addEventListener('click', () => this.host.toBag(i));
      this.attachTip(el, stash[i]!);
    });
  }

  private attachTip(el: HTMLElement, item: ItemInstance): void {
    el.addEventListener('mousemove', (e) => {
      this.tip.style.display = 'block';
      this.tip.style.left = `${e.clientX + 12}px`;
      this.tip.style.top = `${e.clientY + 12}px`;
      const color = RARITY_HEX[item.rarity] ?? '#e8e0cc';
      const aff = item.affixes
        .map((a) => {
          const def = this.host.affixes.find((d) => d.key === a.key);
          return `<div class="aff">${def ? def.labelTemplate.replace('{v}', String(a.value)) : `${a.key} ${a.value}`}</div>`;
        })
        .join('');
      this.tip.innerHTML = `<div class="nm" style="color:${color}">${item.name}</div><div class="sub">${item.rarity} ${item.slot} · base ${item.base}</div>${aff}`;
    });
    el.addEventListener('mouseleave', () => {
      this.tip.style.display = 'none';
    });
  }

  destroy(): void {
    this.panel.remove();
    this.tip.remove();
  }
}
