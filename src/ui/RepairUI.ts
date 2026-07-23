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

// A craftable recipe, resolved against the player's current stock (m2.3).
export interface CraftEntry {
  id: string;
  name: string;
  description: string;
  inputs: { name: string; color: string; have: number; need: number }[];
  gold: number;
  resultLabel: string; // e.g. "rare Chest"
  resultRarity: string;
  can: boolean; // player has every input + the gold
}

// The player's material stock, one row per material they hold any of.
export interface MaterialStock {
  name: string;
  color: string;
  count: number;
}

export interface RepairUIHost {
  gold: () => number;
  repairables: () => RepairEntry[];
  repair: (key: string) => void;
  repairAll: () => void;
  recipes: () => CraftEntry[];
  materials: () => MaterialStock[];
  craft: (recipeId: string) => void;
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
  #azer-repair h4{font-size:12px;border-bottom:2px solid #8a6d3b;margin:10px 0 4px;letter-spacing:1px;}
  #azer-repair .mats{font-size:9px;color:#5a4a30;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px 8px;}
  #azer-repair .mats .none{font-style:italic;color:#7a6a4a;}
  #azer-repair .mats .m .sw{display:inline-block;width:7px;height:7px;border:1px solid #000;vertical-align:middle;margin-right:2px;}
  #azer-repair .recipe{border:2px solid #8a6d3b;border-radius:4px;padding:5px 6px;margin-bottom:5px;background:rgba(255,255,255,.5);}
  #azer-repair .recipe.cant{opacity:.55;}
  #azer-repair .recipe .rn{font-size:11px;font-weight:bold;display:flex;justify-content:space-between;gap:6px;}
  #azer-repair .recipe .rd{font-size:9px;color:#5a4a30;font-style:italic;margin:1px 0 3px;}
  #azer-repair .recipe .ing{font-size:9px;margin-bottom:4px;}
  #azer-repair .recipe .ing .lack{color:#b23b2e;}
  #azer-repair .recipe .ing .ok{color:#3a6a30;}
  #azer-repair .recipe button{width:100%;font-family:inherit;font-size:10px;font-weight:bold;color:#2b2033;
    background:#9bd08a;border:2px solid #8a6d3b;border-radius:4px;padding:4px;cursor:pointer;}
  #azer-repair .recipe button:disabled{opacity:.5;cursor:not-allowed;background:#cfc7b0;}
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
    }${this.craftSection()}`;

    this.panel.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
      if (!el.classList.contains('cant')) el.addEventListener('click', () => this.host.repair(el.dataset['key'] as string));
    });
    const allBtn = this.panel.querySelector<HTMLButtonElement>('.all');
    if (allBtn && !allDisabled) allBtn.addEventListener('click', () => this.host.repairAll());
    this.panel.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((btn) => {
      if (!btn.disabled) btn.addEventListener('click', () => this.host.craft(btn.dataset['craft'] as string));
    });
  }

  private craftSection(): string {
    const stock = this.host.materials();
    const matsLine = stock.length
      ? stock
          .map((m) => `<span class="m"><span class="sw" style="background:${m.color}"></span>${m.name} ×${m.count}</span>`)
          .join('')
      : '<span class="none">No materials yet — slay foes to gather them.</span>';

    const recipes = this.host
      .recipes()
      .map((r) => {
        const ing = r.inputs
          .map(
            (i) =>
              `<span class="${i.have >= i.need ? 'ok' : 'lack'}"><span class="sw" style="background:${i.color};display:inline-block;width:7px;height:7px;border:1px solid #000;vertical-align:middle;margin-right:1px;"></span>${i.name} ${i.have}/${i.need}</span>`,
          )
          .join(' · ');
        const goldLabel = r.gold > 0 ? ` · ${r.gold}g` : '';
        return `<div class="recipe${r.can ? '' : ' cant'}"><div class="rn"><span style="color:${RARITY_HEX[r.resultRarity] ?? '#2b2033'}">${r.name}</span></div>${
          r.description ? `<div class="rd">${r.description}</div>` : ''
        }<div class="ing">${ing}${goldLabel}</div><button data-craft="${r.id}"${r.can ? '' : ' disabled'}>Forge ${r.resultLabel}</button></div>`;
      })
      .join('');

    return `<h4>CRAFT</h4><div class="mats">${matsLine}</div>${recipes}`;
  }

  destroy(): void {
    this.panel.remove();
  }
}
