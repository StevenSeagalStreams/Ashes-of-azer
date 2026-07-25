import type { DialogueChoice } from '../data/schemas/index.ts';

// Conversation overlay (Milestone 2.2): portrait, text crawl, choice buttons.
// DOM per CLAUDE.md, parchment-styled. The scene owns the conversation state
// (which node, applying actions); this just renders a node and reports clicks.

export interface DialogueUIHost {
  onChoice: (choice: DialogueChoice) => void;
  onClose: () => void;
}

const STYLE_ID = 'azer-dialogue-ui-style';
const CSS = `
  #azer-dialogue{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:420px;max-width:92%;
    background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:flex;gap:10px;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;z-index:45;}
  #azer-dialogue .portrait{width:56px;height:56px;flex:0 0 56px;border:3px solid #8a6d3b;border-radius:6px;
    background:#241a30;image-rendering:pixelated;object-fit:contain;}
  #azer-dialogue .body{flex:1;min-width:0;}
  #azer-dialogue .who{font-size:12px;font-weight:bold;color:#8a3b2a;letter-spacing:1px;margin-bottom:2px;}
  #azer-dialogue .text{font-size:12px;line-height:1.4;min-height:34px;white-space:pre-wrap;}
  #azer-dialogue .choices{margin-top:8px;display:flex;flex-direction:column;gap:4px;}
  #azer-dialogue .choice{font-family:inherit;font-size:11px;text-align:left;color:#2b2033;background:#e8d8b0;
    border:2px solid #8a6d3b;border-radius:5px;padding:5px 8px;cursor:pointer;}
  #azer-dialogue .choice:hover{background:#f2c96a;}
`;

export class DialogueUI {
  private readonly root: HTMLElement;
  private readonly portraitEl: HTMLImageElement;
  private readonly whoEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly choicesEl: HTMLElement;
  private open = false;
  private crawl: ReturnType<typeof setInterval> | null = null;
  private fullText = '';
  private pendingChoices: DialogueChoice[] = [];

  constructor(private readonly host: DialogueUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.root = document.createElement('div');
    this.root.id = 'azer-dialogue';
    this.root.style.display = 'none';
    this.portraitEl = document.createElement('img');
    this.portraitEl.className = 'portrait';
    const body = document.createElement('div');
    body.className = 'body';
    this.whoEl = document.createElement('div');
    this.whoEl.className = 'who';
    this.textEl = document.createElement('div');
    this.textEl.className = 'text';
    this.choicesEl = document.createElement('div');
    this.choicesEl.className = 'choices';
    body.append(this.whoEl, this.textEl, this.choicesEl);
    this.root.append(this.portraitEl, body);
    // Clicking the text finishes the crawl early.
    this.textEl.addEventListener('click', () => this.finishCrawl());
    app.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Renders a node: who + portrait, crawls the text, then reveals the choices. */
  show(who: string, portraitUrl: string, text: string, choices: DialogueChoice[]): void {
    this.open = true;
    this.root.style.display = 'flex';
    this.whoEl.textContent = who;
    if (portraitUrl) this.portraitEl.src = portraitUrl;
    this.pendingChoices = choices;
    this.fullText = text;
    this.choicesEl.innerHTML = '';
    this.startCrawl();
  }

  private startCrawl(): void {
    this.stopCrawl();
    let i = 0;
    this.textEl.textContent = '';
    this.crawl = setInterval(() => {
      i += 2;
      this.textEl.textContent = this.fullText.slice(0, i);
      if (i >= this.fullText.length) this.finishCrawl();
    }, 16);
  }

  private finishCrawl(): void {
    this.stopCrawl();
    this.textEl.textContent = this.fullText;
    this.renderChoices();
  }

  private stopCrawl(): void {
    if (this.crawl !== null) {
      clearInterval(this.crawl);
      this.crawl = null;
    }
  }

  private renderChoices(): void {
    this.choicesEl.innerHTML = '';
    const choices = this.pendingChoices.length
      ? this.pendingChoices
      : [{ text: '(Leave)' } as DialogueChoice];
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = `▸ ${choice.text}`;
      btn.addEventListener('click', () => this.host.onChoice(choice));
      this.choicesEl.appendChild(btn);
    }
  }

  close(): void {
    this.stopCrawl();
    this.open = false;
    this.root.style.display = 'none';
    this.host.onClose();
  }

  destroy(): void {
    this.stopCrawl();
    this.root.remove();
  }
}
