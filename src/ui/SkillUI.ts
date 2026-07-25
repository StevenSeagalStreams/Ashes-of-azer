import type { SkillData, SkillsFile } from '../data/schemas/index.ts';
import { availableSkillPoints, describeSkill, rankOf, type CastBlock } from '../systems/skills.ts';

// First HTML/CSS overlay UI (CLAUDE.md: UI overlay is DOM, not canvas).
// Hotbar (always visible) + skill panel (K). Styling ports the prototype's
// panel look (ashes_of_azer.html CSS).

export interface HotbarSlotState {
  cooldownRemaining: number;
  block: CastBlock | null;
}

export interface SkillUIHost {
  skills: SkillsFile;
  hotbar: () => (SkillData | null)[];
  level: () => number;
  skillRanks: () => Record<string, number>;
  slotState: (skill: SkillData) => HotbarSlotState;
  rankUp: (skillId: string) => void;
  setSlot: (slot: number, skillId: string | null) => void;
  passives: () => (SkillData | null)[];
  setPassiveSlot: (slot: number, skillId: string | null) => void;
  respec: () => void;
}

const STYLE_ID = 'azer-skill-ui-style';
const CSS = `
  #azer-hotbar{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:none;font-family:"Courier New",monospace;}
  .azer-slot{width:52px;height:52px;border:3px solid #8a6d3b;border-radius:6px;background:#f7efd8;position:relative;text-align:center;color:#2b2033;}
  .azer-slot .key{position:absolute;top:0;left:3px;font-size:10px;color:#8a6d3b;font-weight:bold;}
  .azer-slot .ico{font-size:22px;line-height:36px;display:block;}
  .azer-slot .nm{font-size:8px;display:block;font-weight:bold;}
  .azer-slot .cd{position:absolute;inset:0;background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:46px;border-radius:3px;display:none;font-weight:bold;}
  .azer-slot.oncd .cd{display:block;}
  .azer-slot.nomana{outline:2px solid #4a90d9;}
  .azer-slot.locked{opacity:.45;filter:grayscale(1);}
  #azer-sp{position:absolute;bottom:66px;left:50%;transform:translateX(-50%);font-size:11px;color:#ffd84a;text-shadow:1px 1px 0 #000;background:rgba(0,0,0,.6);padding:2px 10px;border-radius:10px;display:none;font-weight:bold;font-family:"Courier New",monospace;}
  #azer-panel{position:absolute;top:36px;left:12px;width:300px;max-height:460px;background:#f7efd8;border:4px solid #8a6d3b;border-radius:8px;padding:10px;display:none;overflow-y:auto;box-shadow:0 6px 0 rgba(0,0,0,.4);font-family:"Courier New",monospace;color:#2b2033;}
  #azer-panel h3{font-size:13px;border-bottom:2px solid #8a6d3b;margin:0 0 6px;letter-spacing:1px;}
  #azer-panel h3 small{float:right;font-weight:normal;color:#7a6a4a;}
  .azer-sk{font-size:11px;padding:6px;border-radius:4px;margin-bottom:4px;background:rgba(255,255,255,.5);position:relative;}
  .azer-sk.locked{opacity:.55;}
  .azer-sk b{font-size:12px;}
  .azer-sk .d{color:#5a4a30;margin:2px 0;}
  .azer-sk .pips{letter-spacing:2px;color:#8a6d3b;font-size:12px;}
  .azer-sk .pips .on{color:#e07830;}
  .azer-sk button{position:absolute;right:6px;top:6px;width:26px;height:26px;font-size:16px;font-weight:bold;border:2px solid #8a6d3b;border-radius:5px;background:#e8b64c;cursor:pointer;font-family:inherit;}
  .azer-sk button:hover{background:#f2c96a;}
  .azer-sk[data-skill]{cursor:grab;}
  .azer-slot{pointer-events:auto;}
  .azer-slot.droptarget{outline:2px solid #ffd84a;}
  #azer-passives{position:absolute;bottom:10px;right:12px;display:flex;gap:4px;pointer-events:none;font-family:"Courier New",monospace;}
  .azer-pslot{width:36px;height:36px;border:2px solid #8b3fd0;border-radius:6px;background:#f7efd8;text-align:center;pointer-events:auto;position:relative;}
  .azer-pslot .ico{font-size:18px;line-height:32px;}
  .azer-pslot.droptarget{outline:2px solid #ffd84a;}
  #azer-passives .lbl{font-size:8px;color:#c8a8f0;text-shadow:1px 1px 0 #000;position:absolute;top:-11px;left:0;}
  #azer-respec{float:right;margin-left:6px;font-size:9px;border:2px solid #8a6d3b;border-radius:4px;background:#e8b64c;cursor:pointer;font-family:inherit;font-weight:bold;}
  #azer-drag-ghost{position:fixed;pointer-events:none;z-index:50;font-size:22px;opacity:.85;
    text-shadow:1px 1px 0 #000;transform:translate(-50%,-50%);font-family:"Courier New",monospace;}
`;

export class SkillUI {
  private readonly root: HTMLElement;
  private readonly hotbarEl: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly spBadgeEl: HTMLElement;
  private readonly slotEls: { el: HTMLElement; cd: HTMLElement }[] = [];
  private readonly passivesEl!: HTMLElement;
  private pslotEls: HTMLElement[] = [];
  private panelOpen = false;

  constructor(private readonly host: SkillUIHost) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const app = document.getElementById('app');
    if (!app) throw new Error('#app container not found');
    app.style.position = 'relative';
    this.root = document.createElement('div');
    this.root.id = 'azer-ui';
    this.hotbarEl = document.createElement('div');
    this.hotbarEl.id = 'azer-hotbar';
    this.spBadgeEl = document.createElement('div');
    this.spBadgeEl.id = 'azer-sp';
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'azer-panel';
    this.passivesEl = document.createElement('div');
    this.passivesEl.id = 'azer-passives';
    this.root.append(this.hotbarEl, this.spBadgeEl, this.passivesEl, this.panelEl);
    app.appendChild(this.root);
    this.buildHotbar();
    this.buildPassiveBar();
    this.renderPanel();
  }

  destroy(): void {
    this.endDrag();
    this.root.remove();
  }

  // ---- drag & drop: library row → hotbar slot (mouse-event based) ----

  private dragSkillId: string | null = null;
  private dragIsPassive = false;
  private dragFromPslot: number | null = null;
  private ghost: HTMLElement | null = null;
  private readonly onDragMove = (e: MouseEvent): void => {
    if (this.ghost) {
      this.ghost.style.left = `${e.clientX}px`;
      this.ghost.style.top = `${e.clientY}px`;
    }
    if (this.dragIsPassive) {
      const slot = this.pslotAt(e.clientX, e.clientY);
      this.pslotEls.forEach((el, i) => el.classList.toggle('droptarget', slot === i));
    } else {
      const slot = this.slotAt(e.clientX, e.clientY);
      this.slotEls.forEach((s, i) => s.el.classList.toggle('droptarget', slot === i));
    }
  };
  private readonly onDragUp = (e: MouseEvent): void => {
    const skillId = this.dragSkillId;
    const isPassive = this.dragIsPassive;
    const fromPslot = this.dragFromPslot;
    const slot = isPassive ? this.pslotAt(e.clientX, e.clientY) : this.slotAt(e.clientX, e.clientY);
    this.endDrag();
    if (!skillId) return;
    if (isPassive) {
      if (slot !== null) this.host.setPassiveSlot(slot, skillId);
      else if (fromPslot !== null) this.host.setPassiveSlot(fromPslot, null); // dragged out = unslot
    } else if (slot !== null) {
      this.host.setSlot(slot, skillId);
    }
  };

  private pslotAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('.azer-pslot');
    if (!el) return null;
    const i = this.pslotEls.indexOf(el as HTMLElement);
    return i >= 0 ? i : null;
  }

  private slotAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('.azer-slot');
    if (!el) return null;
    const i = this.slotEls.findIndex((s) => s.el === el);
    return i >= 0 ? i : null;
  }

  private startDrag(skill: SkillData, e: MouseEvent, fromPslot: number | null = null): void {
    this.dragSkillId = skill.id;
    this.dragIsPassive = skill.mechanic === 'passive';
    this.dragFromPslot = fromPslot;
    this.ghost = document.createElement('div');
    this.ghost.id = 'azer-drag-ghost';
    this.ghost.textContent = skill.icon;
    document.body.appendChild(this.ghost);
    this.ghost.style.left = `${e.clientX}px`;
    this.ghost.style.top = `${e.clientY}px`;
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragUp);
  }

  private endDrag(): void {
    this.dragSkillId = null;
    this.dragIsPassive = false;
    this.dragFromPslot = null;
    this.pslotEls.forEach((el) => el.classList.remove('droptarget'));
    this.ghost?.remove();
    this.ghost = null;
    this.slotEls.forEach((s) => s.el.classList.remove('droptarget'));
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragUp);
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    this.renderPanel();
  }

  buildHotbar(): void {
    this.hotbarEl.innerHTML = '';
    this.slotEls.length = 0;
    this.host.hotbar().forEach((skill, i) => {
      const el = document.createElement('div');
      el.className = 'azer-slot';
      el.innerHTML = skill
        ? `<span class="key">${i + 1}</span><span class="ico">${skill.icon}</span><span class="nm">${skill.name}</span><span class="cd"></span>`
        : `<span class="key">${i + 1}</span><span class="cd"></span>`;
      const cd = el.querySelector<HTMLElement>('.cd');
      if (!cd) throw new Error('slot build failed');
      this.hotbarEl.appendChild(el);
      this.slotEls.push({ el, cd });
    });
  }

  buildPassiveBar(): void {
    this.passivesEl.innerHTML = '<span class="lbl">PASSIVES</span>';
    this.pslotEls = [];
    this.host.passives().forEach((skill, i) => {
      const el = document.createElement('div');
      el.className = 'azer-pslot';
      el.innerHTML = skill ? `<span class="ico">${skill.icon}</span>` : '';
      el.title = skill ? skill.name : `Passive slot ${i + 1}`;
      if (skill) el.addEventListener('mousedown', (e) => this.startDrag(skill, e, i));
      this.passivesEl.appendChild(el);
      this.pslotEls.push(el);
    });
  }

  /** Called every frame by the scene: cooldown sweep + blocked states. */
  refresh(): void {
    this.host.hotbar().forEach((skill, i) => {
      const slot = this.slotEls[i];
      if (!slot) return;
      if (!skill) {
        slot.el.className = 'azer-slot locked';
        return;
      }
      const state = this.host.slotState(skill);
      slot.el.classList.toggle('locked', state.block === 'locked' || state.block === 'unlearned');
      slot.el.classList.toggle('oncd', state.cooldownRemaining > 0);
      slot.el.classList.toggle('nomana', state.block === 'mana');
      if (state.cooldownRemaining > 0) slot.cd.textContent = String(Math.ceil(state.cooldownRemaining));
    });
    const points = availableSkillPoints(this.host.level(), this.host.skills, this.host.skillRanks());
    this.spBadgeEl.style.display = points > 0 ? 'block' : 'none';
    if (points > 0) this.spBadgeEl.textContent = `${points} skill point${points > 1 ? 's' : ''} — press K`;
  }

  renderPanel(): void {
    this.panelEl.style.display = this.panelOpen ? 'block' : 'none';
    if (!this.panelOpen) return;
    const level = this.host.level();
    const ranks = this.host.skillRanks();
    const points = availableSkillPoints(level, this.host.skills, ranks);
    this.panelEl.innerHTML = `<h3>SKILLS <small>${points} point${points === 1 ? '' : 's'} to spend</small></h3>`;
    const header = this.panelEl.querySelector('h3');
    if (header) {
      const respec = document.createElement('button');
      respec.id = 'azer-respec';
      respec.textContent = 'RESPEC';
      respec.title = 'Refund all spent skill points (free — the trainer will charge later)';
      respec.onclick = () => {
        this.host.respec();
        this.buildPassiveBar();
        this.renderPanel();
      };
      header.appendChild(respec);
    }
    for (const skill of this.host.skills) {
      const rank = rankOf(skill, ranks);
      const locked = level < skill.unlockLevel;
      const row = document.createElement('div');
      row.className = 'azer-sk' + (locked ? ' locked' : '');
      let pips = '';
      for (let i = 1; i <= skill.maxRank; i++)
        pips += `<span class="${i <= rank ? 'on' : ''}">${i <= rank ? '●' : '○'}</span>`;
      const desc = locked
        ? `Unlocks at level ${skill.unlockLevel}`
        : rank === 0
          ? `Not learned — ${describeSkill(skill, 1)}`
          : describeSkill(skill, rank);
      const keyTag = 'key' in skill ? ` <span style="font-size:10px;color:#7a6a4a">[${skill.key}]</span>` : '';
      row.innerHTML = `<b>${skill.icon} ${skill.name}</b>${keyTag}
        <div class="d">${desc}</div><div class="pips">${pips}</div>`;
      if (!locked) {
        row.dataset['skill'] = skill.id;
        row.addEventListener('mousedown', (e) => {
          if ((e.target as HTMLElement).tagName !== 'BUTTON') this.startDrag(skill, e);
        });
      }
      if (!locked && points > 0 && rank < skill.maxRank) {
        const btn = document.createElement('button');
        btn.textContent = '+';
        btn.title = rank === 0 ? 'Learn' : 'Upgrade';
        btn.dataset['skill'] = skill.id;
        btn.onclick = () => {
          this.host.rankUp(skill.id);
          this.renderPanel();
        };
        row.appendChild(btn);
      }
      this.panelEl.appendChild(row);
    }
  }
}
