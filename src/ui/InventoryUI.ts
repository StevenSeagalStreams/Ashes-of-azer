import type { AffixesFile, ItemSlot } from '../data/schemas/index.ts';
import type { ItemInstance } from '../systems/save/schema.ts';

// Inventory & equipment overlay (Milestone 1.7), toggled with I. DOM per
// CLAUDE.md, parchment-styled. Click a bag item to equip it (swapping whatever
// was there back to the bag); click an equipped item to unequip. Hover for a
// rarity-colored tooltip with the item's rolled affixes.

export interface InventoryUIHost {
  affixes: AffixesFile;
  gear: () => Partial<Record<ItemSlot, ItemInstance | null>>;
  bag: () => ItemInstance[];
  equip: (bagIndex: number) => void;
  unequip: (slot: ItemSlot) => void;
}

const SLOTS: ItemSlot[] = ['Weapon', 'Helmet', 'Chest', 'Boots', 'Ring'];
const RARITY_HEX: Record<string, string> = {
  white: '#f4f0e0',
  magic: '#7fa8ee',
  rare: '#e8b64c',
  epic: '#c88af5',
  legendary: '#e07830',
};

const STYLE_ID = 'azer-inv-ui-style';
const CSS = `
  #azer-inv{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:340px;max-height:460px;overflow-y:auto;
    background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-inv h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 6px;letter-spacing:1px;}
  #azer-inv h5{font-size:10px;color:#7a6a4a;margin:8px 0 4px;text-transform:uppercase;letter-spacing:1px;}
  #azer-inv .equip{display:flex;flex-direction:column;gap:3px;}
  #azer-inv .eqrow{display:flex;align-items:center;gap:6px;font-size:11px;}
  #azer-inv .eqrow .slotname{width:56px;color:#7a6a4a;flex:0 0 56px;}
  #azer-inv .cell{border:2px solid #8a6d3b;border-radius:4px;padding:3px 6px;background:rgba(255,255,255,.5);
    font-size:11px;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #azer-inv .cell.empty{color:#9a8a6a;cursor:default;font-style:italic;}
  #azer-inv .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;}
  #azer-inv .bagcell{border:2px solid #8a6d3b;border-radius:4px;padding:4px 6px;background:rgba(255,255,255,.5);
    font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #azer-inv .empty-bag{font-size:10px;color:#7a6a4a;font-style:italic;}
  #azer-item-tip{position:absolute;pointer-events:none;z-index:60;background:#241a30;border:2px solid #8a6d3b;
    border-radius:6px;padding:6px 8px;font-family:"Courier New",monospace;font-size:11px;color:#e8e0cc;
    max-width:200px;display:none;box-shadow:0 4px 0 rgba(0,0,0,.4);}
  #azer-item-tip .nm{font-weight:bold;font-size:12px;}
  #azer-item-tip .sub{color:#a89878;font-size:9px;margin-bottom:3px;}
  #azer-item-tip .aff{color:#8bd06a;}
`;

export class InventoryUI {
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private open = false;

  constructor(private readonly host: InventoryUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.panel = document.createElement('div');
    this.panel.id = 'azer-inv';
    this.tip = document.createElement('div');
    this.tip.id = 'azer-item-tip';
    app.append(this.panel, this.tip);
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.panel.style.display = this.open ? 'block' : 'none';
    this.tip.style.display = 'none';
    if (this.open) this.render();
  }

  refresh(): void {
    if (this.open) this.render();
  }

  private render(): void {
    const gear = this.host.gear();
    const bag = this.host.bag();

    const eqRows = SLOTS.map((slot) => {
      const item = gear[slot] ?? null;
      const cell = item
        ? `<div class="cell" data-unequip="${slot}" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${item.name}</div>`
        : `<div class="cell empty">— empty —</div>`;
      return `<div class="eqrow"><span class="slotname">${slot}</span>${cell}</div>`;
    }).join('');

    const bagCells = bag.length
      ? bag
          .map(
            (item, i) =>
              `<div class="bagcell" data-bag="${i}" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${item.name}</div>`,
          )
          .join('')
      : '<div class="empty-bag">Your bag is empty. Slay something.</div>';

    this.panel.innerHTML = `<h3>INVENTORY</h3><h5>Equipped</h5><div class="equip">${eqRows}</div><h5>Bag (${bag.length})</h5><div class="grid">${bagCells}</div>`;

    this.panel.querySelectorAll<HTMLElement>('[data-bag]').forEach((el) => {
      const i = Number(el.dataset['bag']);
      el.addEventListener('click', () => this.host.equip(i));
      this.attachTip(el, bag[i]!);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-unequip]').forEach((el) => {
      const slot = el.dataset['unequip'] as ItemSlot;
      el.addEventListener('click', () => this.host.unequip(slot));
      const item = gear[slot];
      if (item) this.attachTip(el, item);
    });
  }

  private attachTip(el: HTMLElement, item: ItemInstance): void {
    el.addEventListener('mousemove', (e) => {
      this.tip.style.display = 'block';
      this.tip.style.left = `${e.clientX + 12}px`;
      this.tip.style.top = `${e.clientY + 12}px`;
      this.tip.innerHTML = this.tipHtml(item);
    });
    el.addEventListener('mouseleave', () => {
      this.tip.style.display = 'none';
    });
  }

  private tipHtml(item: ItemInstance): string {
    const color = RARITY_HEX[item.rarity] ?? '#e8e0cc';
    const affLines = item.affixes
      .map((aff) => {
        const def = this.host.affixes.find((a) => a.key === aff.key);
        const label = def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
        return `<div class="aff">${label}</div>`;
      })
      .join('');
    return `<div class="nm" style="color:${color}">${item.name}</div><div class="sub">${item.rarity} ${item.slot} · base ${item.base}</div>${affLines}`;
  }

  destroy(): void {
    this.panel.remove();
    this.tip.remove();
  }
}
