import type { AffixesFile } from '../data/schemas/index.ts';
import type { ItemInstance } from '../systems/save/schema.ts';

// Vendor buy/sell overlay (Milestone 2.3). DOM per CLAUDE.md. Left column is the
// merchant's stock (click to buy if you can afford it); right column is your bag
// (click to sell). Hover shows the item's rarity-colored affix tooltip.

export interface ShopUIHost {
  affixes: AffixesFile;
  gold: () => number;
  stock: () => ItemInstance[];
  bag: () => ItemInstance[];
  buyPrice: (item: ItemInstance) => number;
  sellPrice: (item: ItemInstance) => number;
  buy: (stockIndex: number) => void;
  sell: (bagIndex: number) => void;
}

const RARITY_HEX: Record<string, string> = {
  white: '#f4f0e0',
  magic: '#7fa8ee',
  rare: '#e8b64c',
  epic: '#c88af5',
  legendary: '#e07830',
};

const STYLE_ID = 'azer-shop-ui-style';
const CSS = `
  #azer-shop{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:420px;max-width:94%;max-height:460px;
    overflow-y:auto;background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-shop h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 2px;letter-spacing:1px;}
  #azer-shop .gold{font-size:11px;color:#8a6d3b;font-weight:bold;margin-bottom:6px;}
  #azer-shop .cols{display:flex;gap:10px;}
  #azer-shop .col{flex:1;min-width:0;}
  #azer-shop h5{font-size:10px;color:#7a6a4a;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;}
  #azer-shop .row{display:flex;justify-content:space-between;gap:6px;border:2px solid #8a6d3b;border-radius:4px;
    padding:4px 6px;margin-bottom:4px;background:rgba(255,255,255,.5);font-size:11px;cursor:pointer;}
  #azer-shop .row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #azer-shop .row.cant{opacity:.5;cursor:not-allowed;}
  #azer-shop .row .pr{color:#8a6d3b;font-weight:bold;flex:0 0 auto;}
  #azer-shop .empty{font-size:10px;color:#7a6a4a;font-style:italic;}
  #azer-shop-tip{position:absolute;pointer-events:none;z-index:60;background:#241a30;border:2px solid #8a6d3b;
    border-radius:6px;padding:6px 8px;font-family:"Courier New",monospace;font-size:11px;color:#e8e0cc;
    max-width:200px;display:none;box-shadow:0 4px 0 rgba(0,0,0,.4);}
  #azer-shop-tip .nm{font-weight:bold;font-size:12px;}
  #azer-shop-tip .sub{color:#a89878;font-size:9px;margin-bottom:3px;}
  #azer-shop-tip .aff{color:#8bd06a;}
`;

export class ShopUI {
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private open = false;

  constructor(private readonly host: ShopUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.panel = document.createElement('div');
    this.panel.id = 'azer-shop';
    this.tip = document.createElement('div');
    this.tip.id = 'azer-shop-tip';
    app.append(this.panel, this.tip);
  }

  isOpen(): boolean {
    return this.open;
  }

  openShop(): void {
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
    const gold = this.host.gold();
    const stock = this.host.stock();
    const bag = this.host.bag();

    const buyRows = stock.length
      ? stock
          .map((item, i) => {
            const price = this.host.buyPrice(item);
            const cant = gold < price;
            return `<div class="row${cant ? ' cant' : ''}" data-buy="${i}"><span class="nm" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${item.name}</span><span class="pr">${price}g</span></div>`;
          })
          .join('')
      : '<div class="empty">Sold out.</div>';

    const sellRows = bag.length
      ? bag
          .map(
            (item, i) =>
              `<div class="row" data-sell="${i}"><span class="nm" style="color:${RARITY_HEX[item.rarity] ?? '#2b2033'}">${item.name}</span><span class="pr">${this.host.sellPrice(item)}g</span></div>`,
          )
          .join('')
      : '<div class="empty">Nothing to sell.</div>';

    this.panel.innerHTML = `<h3>MERCHANT</h3><div class="gold">Gold: ${gold}</div><div class="cols"><div class="col"><h5>Buy</h5>${buyRows}</div><div class="col"><h5>Sell</h5>${sellRows}</div></div>`;

    this.panel.querySelectorAll<HTMLElement>('[data-buy]').forEach((el) => {
      const i = Number(el.dataset['buy']);
      if (!el.classList.contains('cant')) el.addEventListener('click', () => this.host.buy(i));
      this.attachTip(el, stock[i]!);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-sell]').forEach((el) => {
      const i = Number(el.dataset['sell']);
      el.addEventListener('click', () => this.host.sell(i));
      this.attachTip(el, bag[i]!);
    });
  }

  private attachTip(el: HTMLElement, item: ItemInstance): void {
    el.addEventListener('mousemove', (e) => {
      this.tip.style.display = 'block';
      this.tip.style.left = `${e.clientX + 12}px`;
      this.tip.style.top = `${e.clientY + 12}px`;
      const color = RARITY_HEX[item.rarity] ?? '#e8e0cc';
      const affLines = item.affixes
        .map((aff) => {
          const def = this.host.affixes.find((a) => a.key === aff.key);
          const label = def ? def.labelTemplate.replace('{v}', String(aff.value)) : `${aff.key} ${aff.value}`;
          return `<div class="aff">${label}</div>`;
        })
        .join('');
      this.tip.innerHTML = `<div class="nm" style="color:${color}">${item.name}</div><div class="sub">${item.rarity} ${item.slot} · base ${item.base}</div>${affLines}`;
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
