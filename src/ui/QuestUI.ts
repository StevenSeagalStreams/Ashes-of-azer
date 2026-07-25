import type { QuestData, QuestObjective, QuestsFile } from '../data/schemas/index.ts';
import type { QuestState } from '../systems/save/schema.ts';

// Quest journal (J) + always-on tracker. DOM overlay per CLAUDE.md, styled to
// match SkillUI's parchment look. Reads a QuestState snapshot from the scene;
// clicking a quest in the journal pins it to the tracker.

export interface QuestUIHost {
  quests: QuestsFile; // catalog
  state: () => QuestState;
  setTracked: (id: string) => void;
}

const STYLE_ID = 'azer-quest-ui-style';
const CSS = `
  #azer-tracker{position:absolute;top:34px;right:12px;width:170px;background:rgba(30,22,38,.82);
    border:2px solid #8a6d3b;border-radius:6px;padding:6px 8px;font-family:"Courier New",monospace;
    color:#f7efd8;font-size:10px;pointer-events:none;}
  #azer-tracker.empty{display:none;}
  #azer-tracker h4{margin:0 0 3px;font-size:11px;color:#ffd84a;letter-spacing:.5px;}
  #azer-tracker .obj{color:#d8ccb0;margin:1px 0;}
  #azer-tracker .obj.done{color:#8bd06a;text-decoration:line-through;}
  #azer-quest-panel{position:absolute;top:36px;right:12px;width:270px;max-height:440px;overflow-y:auto;
    background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;
    box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-quest-panel h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 6px;letter-spacing:1px;}
  #azer-quest-panel h5{font-size:10px;color:#7a6a4a;margin:8px 0 3px;text-transform:uppercase;letter-spacing:1px;}
  .azer-q{font-size:11px;padding:6px;border-radius:4px;margin-bottom:4px;background:rgba(255,255,255,.5);cursor:pointer;}
  .azer-q.tracked{outline:2px solid #ffd84a;}
  .azer-q.done{opacity:.6;cursor:default;}
  .azer-q b{font-size:12px;}
  .azer-q .obj{color:#5a4a30;margin:2px 0 0;}
  .azer-q .obj.ok{color:#3e8948;}
  #azer-quest-empty{font-size:10px;color:#7a6a4a;font-style:italic;}
`;

const VERB: Record<QuestObjective['type'], string> = {
  kill: 'Slay',
  collect: 'Collect',
  talkTo: 'Talk to',
  reach: 'Reach',
};

const pretty = (id: string): string => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export class QuestUI {
  private readonly trackerEl: HTMLElement;
  private readonly panelEl: HTMLElement;
  private open = false;

  constructor(private readonly host: QuestUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    this.trackerEl = document.createElement('div');
    this.trackerEl.id = 'azer-tracker';
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'azer-quest-panel';
    app.append(this.trackerEl, this.panelEl);
    this.refresh();
  }

  togglePanel(): void {
    this.open = !this.open;
    this.panelEl.style.display = this.open ? 'block' : 'none';
    if (this.open) this.renderPanel();
  }

  /** Redraws the tracker (and the panel if it's open) from the live state. */
  refresh(): void {
    this.renderTracker();
    if (this.open) this.renderPanel();
  }

  private questById(id: string): QuestData | undefined {
    return this.host.quests.find((q) => q.id === id);
  }

  private objLine(quest: QuestData, obj: QuestObjective, i: number): { text: string; done: boolean } {
    const cur = this.host.state().progress[quest.id]?.[i] ?? 0;
    const done = cur >= obj.count;
    return { text: `${VERB[obj.type]} ${pretty(obj.target)} ${Math.min(cur, obj.count)}/${obj.count}`, done };
  }

  private renderTracker(): void {
    const s = this.host.state();
    const quest = s.tracked ? this.questById(s.tracked) : undefined;
    if (!quest) {
      this.trackerEl.className = 'empty';
      this.trackerEl.innerHTML = '';
      return;
    }
    this.trackerEl.className = '';
    const objs = quest.objectives
      .map((o, i) => {
        const { text, done } = this.objLine(quest, o, i);
        return `<div class="obj${done ? ' done' : ''}">${done ? '✓ ' : '• '}${text}</div>`;
      })
      .join('');
    this.trackerEl.innerHTML = `<h4>${quest.name}</h4>${objs}`;
  }

  private renderPanel(): void {
    const s = this.host.state();
    const active = s.active.map((id) => this.questById(id)).filter((q): q is QuestData => !!q);
    const completed = s.completed.map((id) => this.questById(id)).filter((q): q is QuestData => !!q);

    const activeHtml = active.length
      ? active.map((q) => this.questCard(q, s.tracked === q.id, false)).join('')
      : '<div id="azer-quest-empty">No active quests.</div>';
    const doneHtml = completed.map((q) => this.questCard(q, false, true)).join('');

    this.panelEl.innerHTML = `<h3>QUEST LOG</h3><h5>Active</h5>${activeHtml}${
      completed.length ? `<h5>Completed</h5>${doneHtml}` : ''
    }`;

    this.panelEl.querySelectorAll<HTMLElement>('.azer-q[data-quest]').forEach((el) => {
      el.addEventListener('click', () => {
        this.host.setTracked(el.dataset['quest'] as string);
        this.refresh();
      });
    });
  }

  private questCard(quest: QuestData, tracked: boolean, done: boolean): string {
    const objs = done
      ? ''
      : quest.objectives
          .map((o, i) => {
            const line = this.objLine(quest, o, i);
            return `<div class="obj${line.done ? ' ok' : ''}">${line.done ? '✓' : '•'} ${line.text}</div>`;
          })
          .join('');
    const attr = done ? '' : ` data-quest="${quest.id}"`;
    const cls = `azer-q${tracked ? ' tracked' : ''}${done ? ' done' : ''}`;
    return `<div class="${cls}"${attr}><b>${quest.name}</b>${objs}</div>`;
  }

  destroy(): void {
    this.trackerEl.remove();
    this.panelEl.remove();
  }
}
