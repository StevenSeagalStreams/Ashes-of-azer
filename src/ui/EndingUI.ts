// Finale overlay (Milestone 3). A full-screen end-screen shown when the player
// seals one of the three endings at the Shrine of Ashes. Title + body text for
// the chosen path (data-driven from endings.json), then a "Begin Anew" button
// that returns to the Title scene. DOM per CLAUDE.md.

export interface EndingUIHost {
  onBeginAnew: () => void;
}

const STYLE_ID = 'azer-ending-ui-style';
const CSS = `
  #azer-ending{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;
    gap:18px;padding:32px;text-align:center;background:radial-gradient(circle at 50% 40%,#2a1030 0%,#0a0410 80%);
    font-family:"Courier New",monospace;color:#e8dcc0;z-index:80;animation:azer-ending-fade 2.4s ease-out;}
  @keyframes azer-ending-fade{from{opacity:0;} to{opacity:1;}}
  #azer-ending .mark{font-size:34px;color:#e8a86a;text-shadow:0 0 14px rgba(232,168,106,.7);letter-spacing:4px;}
  #azer-ending .title{font-size:26px;font-weight:bold;color:#f2c96a;letter-spacing:3px;
    text-shadow:0 0 12px rgba(242,201,106,.55);}
  #azer-ending .body{max-width:560px;font-size:14px;line-height:1.7;color:#d8ccb0;white-space:pre-wrap;}
  #azer-ending .again{margin-top:12px;font-family:inherit;font-size:13px;letter-spacing:2px;color:#2b2033;
    background:#e8d8b0;border:3px solid #8a6d3b;border-radius:6px;padding:9px 20px;cursor:pointer;
    box-shadow:0 4px 0 rgba(0,0,0,.5);}
  #azer-ending .again:hover{background:#f2c96a;}
`;

export class EndingUI {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private open = false;

  constructor(private readonly host: EndingUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.root = document.createElement('div');
    this.root.id = 'azer-ending';
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.textContent = '✦';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title';
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'body';
    const again = document.createElement('button');
    again.className = 'again';
    again.textContent = 'BEGIN ANEW';
    again.addEventListener('click', () => this.host.onBeginAnew());
    this.root.append(mark, this.titleEl, this.bodyEl, again);
    app.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Shows the end-screen for a sealed ending. */
  show(title: string, text: string): void {
    this.open = true;
    this.titleEl.textContent = title;
    this.bodyEl.textContent = text;
    this.root.style.display = 'flex';
  }

  destroy(): void {
    this.root.remove();
  }
}
