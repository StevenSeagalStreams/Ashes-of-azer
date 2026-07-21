// Blacksmith repair overlay (Milestone 2.3). DOM per CLAUDE.md. Lists every
// worn item (equipped or in the bag) with its durability and a gold cost to
// restore it; click to repair one, or Repair All. Opened by a
// `service: 'blacksmith'` NPC.

export interface RepairEntry {
  key: string; // opaque handle the scene maps back to a gear slot / bag index
  name: string;
  rarity: string;
  durability: number;
  maxDurability: number;
  cost: number;
}

export interface RepairUIHost {
  gold: () => number;
  repairables: () => RepairEntry[];
  repair: (key: string) => void;
  repairAll: () => void;
}

const RARITY_HEX: Record<string, string> = {
  white: '#f4f0e0',
  magic: '#7fa8ee',
  rare: '#e8b64c',
  epic: '#c88af5',
  legendary: '#e07830',
};

const STYLE_ID = 'azer-repair-ui-style';
const CSS = `
  #azer-repair{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:320px;max-width:92%;max-height:440px;
    overflow-y:auto;background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-repair h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 2px;letter-spacing:1px;}
  #azer-repair .gold{font-size:11px;color:#8a6d3b;font-weight:bold;margin-bottom:6px;}
  #azer-repair .row{display:flex;justify-content:space-between;align-items:center;gap:6px;border:2px solid #8a6d3b;
    border-radius:4px;padding:4px 6px;margin-bottom:4px;background:rgba(255,255,255,.5);font-size:11px;cursor:pointer;}
  #azer-repair .row.cant{opacity:.5;cursor:not-allowed;}
  #azer-repair .row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #azer-repair .row .dur{color:#5a4a30;font-size:9px;}
  #azer-repair .row .pr{color:#8a6d3b;font-weight:bold;flex:0 0 auto;}
  #azer-repair .empty{font-size:10px;color:#7a6a4a;font-style:italic;}
  #azer-repair .all{width:100%;margin-top:6px;font-family:inherit;font-size:11px;font-weight:bold;color:#2b2033;
    background:#e8b64c;border:2px solid #8a6d3b;border-radius:5px;padding:5px;cursor:pointer;}
  #azer-repair .all:disabled{opacity:.5;cursor:not-allowed;}
`;

export class RepairUI {
  private readonly panel: HTMLElement;
  private open = false;

  constructor(private readonly host: RepairUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.panel = document.createElement('div');
    this.panel.id = 'azer-repair';
    app.appendChild(this.panel);
  }

  isOpen(): boolean {
    return this.open;
  }

  openRepair(): void {
    this.open = true;
    this.panel.style.display = 'block';
    this.render();
  }

  close(): void {
    this.open = false;
    this.panel.style.display = 'none';
  }

  refresh(): void {
    if (this.open) this.render();
  }

  private render(): void {
    const gold = this.host.gold();
    const items = this.host.repairables();
    const total = items.reduce((s, e) => s + e.cost, 0);

    const rows = items.length
      ? items
          .map((e) => {
            const cant = gold < e.cost;
            return `<div class="row${cant ? ' cant' : ''}" data-key="${e.key}"><span class="nm" style="color:${RARITY_HEX[e.rarity] ?? '#2b2033'}">${e.name}<span class="dur"> ${e.durability}/${e.maxDurability}</span></span><span class="pr">${e.cost}g</span></div>`;
          })
          .join('')
      : '<div class="empty">Everything is in good repair.</div>';

    const allDisabled = items.length === 0 || gold < total;
    this.panel.innerHTML = `<h3>BLACKSMITH</h3><div class="gold">Gold: ${gold}</div>${rows}${
      items.length ? `<button class="all"${allDisabled ? ' disabled' : ''}>Repair All (${total}g)</button>` : ''
    }`;

    this.panel.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
      if (!el.classList.contains('cant')) el.addEventListener('click', () => this.host.repair(el.dataset['key'] as string));
    });
    const allBtn = this.panel.querySelector<HTMLButtonElement>('.all');
    if (allBtn && !allDisabled) allBtn.addEventListener('click', () => this.host.repairAll());
  }

  destroy(): void {
    this.panel.remove();
  }
}
