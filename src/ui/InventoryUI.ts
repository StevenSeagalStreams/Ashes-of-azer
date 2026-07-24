import type { AffixesFile, ItemSlot, RuneData, RunewordData, SetData } from '../data/schemas/index.ts';
import type { ItemInstance } from '../systems/save/schema.ts';
import { isIdentified } from '../systems/loot.ts';
import { canSocket, matchRuneword } from '../systems/sockets.ts';

/** Where a rune is being socketed — an equipped slot or a bag index. */
export type SocketTarget = { kind: 'gear'; slot: ItemSlot } | { kind: 'bag'; index: number };

// Inventory & equipment overlay (Milestone 1.7), toggled with I. DOM per
// CLAUDE.md, parchment-styled. Click a bag item to equip it (swapping whatever
// was there back to the bag); click an equipped item to unequip. Hover for a
// rarity-colored tooltip with the item's rolled affixes.

export interface InventoryUIHost {
  affixes: AffixesFile;
  sets: readonly SetData[];
  runes: readonly RuneData[];
  runewords: readonly RunewordData[];
  gear: () => Partial<Record<ItemSlot, ItemInstance | null>>;
  bag: () => ItemInstance[];
  heldRunes: () => string[]; // rune ids awaiting socketing
  equip: (bagIndex: number) => void;
  unequip: (slot: ItemSlot) => void;
  identify: (bagIndex: number) => void;
  socketInto: (runeId: string, target: SocketTarget) => void;
}

const SLOTS: ItemSlot[] = ['Weapon', 'Helmet', 'Chest', 'Boots', 'Ring'];
const RARITY_HEX: Record<string, string> = {
  white: '#f4f0e0',
  magic: '#7fa8ee',
  rare: '#e8b64c',
  epic: '#c88af5',
  set: '#8bd06a',
  legendary: '#e07830',
  unique: '#e07830',
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
  #azer-inv .sockets{color:#8a6d3b;letter-spacing:1px;}
  #azer-inv .sockets .filled{color:#c8a86a;}
  #azer-inv .cell.socketable,#azer-inv .bagcell.socketable{box-shadow:0 0 0 2px #c8a86a inset;}
  #azer-inv .runes{display:flex;flex-wrap:wrap;gap:4px;}
  #azer-inv .rune{border:2px solid #8a6d3b;border-radius:4px;padding:3px 6px;background:rgba(255,255,255,.5);
    font-size:11px;cursor:pointer;color:#6a4a2a;}
  #azer-inv .rune.sel{background:#f2c96a;border-color:#e07830;}
  #azer-inv .hint{font-size:9px;color:#8a3b2a;margin:2px 0;}
  #azer-inv .unid{font-style:italic;}
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
  private selectedRune: string | null = null; // rune picked for socketing

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

  /** Socket pips for an item: filled sockets show the rune letter. */
  private socketPips(item: ItemInstance): string {
    const total = item.sockets ?? 0;
    if (total === 0) return '';
    const filled = item.socketed ?? [];
    const pips = Array.from({ length: total }, (_, i) => {
      const runeId = filled[i];
      if (runeId) {
        const rune = this.host.runes.find((r) => r.id === runeId);
        return `<span class="filled">◆${rune?.letter ?? ''}</span>`;
      }
      return '◇';
    }).join(' ');
    return ` <span class="sockets">${pips}</span>`;
  }

  /** Cell text: unidentified items hide their name (base slot only), else name + pips. */
  private cellLabel(item: ItemInstance): string {
    if (!isIdentified(item)) return `<span class="unid">? Unidentified ${item.slot}</span>`;
    return `${item.name}${this.socketPips(item)}`;
  }

  private render(): void {
    const gear = this.host.gear();
    const bag = this.host.bag();
    const socketing = this.selectedRune !== null;
    const socketable = (item: ItemInstance | null): boolean => socketing && !!item && canSocket(item);

    const eqRows = SLOTS.map((slot) => {
      const item = gear[slot] ?? null;
      const cell = item
        ? `<div class="cell${socketable(item) ? ' socketable' : ''}" data-unequip="${slot}" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${this.cellLabel(item)}</div>`
        : `<div class="cell empty">— empty —</div>`;
      return `<div class="eqrow"><span class="slotname">${slot}</span>${cell}</div>`;
    }).join('');

    const bagCells = bag.length
      ? bag
          .map(
            (item, i) =>
              `<div class="bagcell${socketable(item) ? ' socketable' : ''}" data-bag="${i}" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${this.cellLabel(item)}</div>`,
          )
          .join('')
      : '<div class="empty-bag">Your bag is empty. Slay something.</div>';

    // Runes the player holds, grouped and counted.
    const held = this.host.heldRunes();
    const counts = new Map<string, number>();
    for (const id of held) counts.set(id, (counts.get(id) ?? 0) + 1);
    const runeChips = [...counts.entries()]
      .map(([id, n]) => {
        const rune = this.host.runes.find((r) => r.id === id);
        const label = rune ? rune.name : id;
        const sel = this.selectedRune === id ? ' sel' : '';
        return `<div class="rune${sel}" data-rune="${id}">⟡ ${label}${n > 1 ? ` ×${n}` : ''}</div>`;
      })
      .join('');
    const runeSection = held.length
      ? `<h5>Runes (${held.length})</h5>${socketing ? '<div class="hint">Click a socketable item (highlighted) to insert, or the rune again to cancel.</div>' : ''}<div class="runes">${runeChips}</div>`
      : '';

    this.panel.innerHTML = `<h3>INVENTORY</h3><h5>Equipped</h5><div class="equip">${eqRows}</div><h5>Bag (${bag.length})</h5><div class="grid">${bagCells}</div>${runeSection}`;

    this.panel.querySelectorAll<HTMLElement>('[data-bag]').forEach((el) => {
      const i = Number(el.dataset['bag']);
      const item = bag[i]!;
      el.addEventListener('click', () => {
        if (!isIdentified(item)) this.host.identify(i);
        else if (this.selectedRune && canSocket(item)) this.doSocket({ kind: 'bag', index: i });
        else this.host.equip(i);
      });
      this.attachTip(el, item);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-unequip]').forEach((el) => {
      const slot = el.dataset['unequip'] as ItemSlot;
      const item = gear[slot];
      el.addEventListener('click', () => {
        if (this.selectedRune && item && canSocket(item)) this.doSocket({ kind: 'gear', slot });
        else this.host.unequip(slot);
      });
      if (item) this.attachTip(el, item);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-rune]').forEach((el) => {
      const id = el.dataset['rune']!;
      el.addEventListener('click', () => {
        this.selectedRune = this.selectedRune === id ? null : id;
        this.render();
      });
    });
  }

  private doSocket(target: SocketTarget): void {
    const runeId = this.selectedRune;
    if (!runeId) return;
    this.selectedRune = null;
    this.host.socketInto(runeId, target);
    // host applies the change + calls refresh(); render() re-runs from there.
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
    if (!isIdentified(item)) {
      // Hide the roll (and the unique/set name it would spoil) until identified.
      return `<div class="nm" style="color:${color}">Unidentified ${item.slot}</div><div class="sub">${item.rarity} · unidentified</div><div class="hint">Click to identify.</div>`;
    }
    const affLines = item.affixes
      .map((aff) => {
        const def = this.host.affixes.find((a) => a.key === aff.key);
        const label = def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
        return `<div class="aff">${label}</div>`;
      })
      .join('');
    const ilvl = item.ilvl ? ` · ilvl ${item.ilvl}` : '';
    const socketLine = this.socketTipHtml(item);
    return `<div class="nm" style="color:${color}">${item.name}</div><div class="sub">${item.rarity} ${item.slot} · base ${item.base}${ilvl}</div>${affLines}${socketLine}${this.setHtml(item)}`;
  }

  /** Renders affix lines from a {key,value} list using the affix templates. */
  private affixLabels(affixes: readonly { key: string; value: number }[], color: string): string {
    return affixes
      .map((aff) => {
        const def = this.host.affixes.find((a) => a.key === aff.key);
        const label = def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
        return `<div class="aff" style="color:${color}">${label}</div>`;
      })
      .join('');
  }

  /** Tooltip block for sockets: the runeword (if complete) or each rune's stat. */
  private socketTipHtml(item: ItemInstance): string {
    if (!item.sockets) return '';
    // A completed runeword replaces the per-rune stats with its fixed powers.
    const runeword = matchRuneword(item, this.host.runewords);
    if (runeword) {
      return `<div class="setname" style="color:#c8a86a">◆ ${runeword.name} (Runeword)</div>${this.affixLabels(runeword.affixes, '#c8a86a')}`;
    }
    const filled = (item.socketed ?? [])
      .map((id) => {
        const rune = this.host.runes.find((r) => r.id === id);
        if (!rune) return id;
        const stats = rune.affixes
          .map((aff) => {
            const def = this.host.affixes.find((a) => a.key === aff.key);
            return def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
          })
          .join(', ');
        return `${rune.letter}: ${stats}`;
      })
      .map((line) => `<div class="aff" style="color:#c8a86a">◆ ${line}</div>`)
      .join('');
    const open = (item.sockets ?? 0) - (item.socketed?.length ?? 0);
    const openLine = open > 0 ? `<div class="sub">◇ ${open} open socket${open > 1 ? 's' : ''}</div>` : '';
    return `${filled}${openLine}`;
  }

  /** Set block: names the set and lists each partial-set bonus, lit when active. */
  private setHtml(item: ItemInstance): string {
    if (!item.set) return '';
    const set = this.host.sets.find((s) => s.id === item.set);
    if (!set) return '';
    const worn = Object.values(this.host.gear()).filter((g) => g && g.set === set.id).length;
    const bonusLines = set.bonuses
      .map((b) => {
        const on = worn >= b.pieces;
        const labels = b.affixes
          .map((aff) => {
            const def = this.host.affixes.find((a) => a.key === aff.key);
            return def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
          })
          .join(', ');
        return `<div class="setb" style="color:${on ? '#8bd06a' : '#6a7a52'}">(${b.pieces}) ${labels}</div>`;
      })
      .join('');
    return `<div class="setname" style="color:#8bd06a">◈ ${set.name} (${worn}/${set.pieces.length})</div>${bonusLines}`;
  }

  destroy(): void {
    this.panel.remove();
    this.tip.remove();
  }
}
