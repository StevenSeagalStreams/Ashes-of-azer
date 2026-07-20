// Pure skill/XP math ported from the prototype. Unit tested.

import type { ClassId, PassiveStat, SkillData, SkillsFile } from '../data/schemas/index.ts';

export const MANA_REGEN = 4; // per second (prototype update(): mp += 4*dt)

// Prototype: mmax = 50 + level*5
export const manaMaxFor = (level: number): number => 50 + level * 5;

// Prototype: player.xpNext starts at 40, *1.5 (rounded) per level.
export function xpToNext(level: number): number {
  let next = 40;
  for (let l = 1; l < level; l++) next = Math.round(next * 1.5);
  return next;
}

export interface LevelState {
  level: number;
  xp: number;
}

export interface XpResult extends LevelState {
  levelsGained: number;
}

// Prototype gainXp(): while xp >= xpNext, level up (1 skill point per level).
export function applyXp(state: LevelState, amount: number): XpResult {
  let { level, xp } = state;
  xp += amount;
  let levelsGained = 0;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    levelsGained++;
  }
  return { level, xp, levelsGained };
}

// Prototype: skill effects scale linearly with rank.
export const scaleValue = (s: { base: number; perRank: number }, rank: number): number =>
  s.base + s.perRank * rank;

// Prototype trySkill(): t = cd * (1 - cdr/100); ST.cdr capped at 60.
export function skillCooldown(baseCooldown: number, cdrPct: number): number {
  return baseCooldown * (1 - Math.min(cdrPct, 60) / 100);
}

export const rankOf = (skill: SkillData, skillRanks: Record<string, number>): number =>
  skillRanks[skill.id] ?? skill.startingRank;

/**
 * Skill points: 1 per level gained (prototype). Available = earned − spent,
 * where spent is ranks bought beyond each skill's free starting rank.
 * Derived rather than stored so the save can never disagree with itself.
 */
export function availableSkillPoints(
  level: number,
  skills: SkillsFile,
  skillRanks: Record<string, number>,
): number {
  const earned = level - 1;
  let spent = 0;
  for (const skill of skills) {
    spent += Math.max(0, rankOf(skill, skillRanks) - skill.startingRank);
  }
  return earned - spent;
}

// Human-readable effect line for a rank, built generically from the
// mechanic data (kept out of skills.json for now — recorded decision;
// a descTemplate content field can replace this if wording needs authoring).
export function describeSkill(skill: SkillData, rank: number): string {
  const r = Math.max(rank, 1);
  const pct = (s: { base: number; perRank: number }): number => Math.round(scaleValue(s, r) * 100);
  switch (skill.mechanic) {
    case 'passive': {
      const LABELS: Record<string, string> = {
        maxHpPct: '% Max Life',
        moveSpeedPct: '% Movement Speed',
        critPct: '% Critical Chance',
        aspdPct: '% Attack Speed',
        cdrPct: '% Cooldown Reduction',
        damagePct: '% Damage',
        lifestealPct: '% Life Steal',
        thornsPct: '% Thorns',
        blockPct: '% Block Chance',
        manaOnKill: ' Mana on Kill',
        damageVsStunnedPct: '% Damage vs Stunned',
        berserkDamagePct: '% Damage while below 30% life',
      };
      const parts = Object.entries(skill.modifiers).map(
        ([stat, s]) => `+${Math.round(scaleValue(s, r))}${LABELS[stat] ?? stat}`,
      );
      return `Passive: ${parts.join(', ')}`;
    }
    case 'shockwave': {
      const stun = skill.stunDuration ? `, stun ${scaleValue(skill.stunDuration, r).toFixed(1)}s` : '';
      const bleed = skill.bleed
        ? `, bleed ${Math.round(scaleValue(skill.bleed.dps, r))}/s for ${skill.bleed.duration}s`
        : '';
      return `Hit foes in ${Math.round(scaleValue(skill.radius, r))}px for ${pct(skill.damageMultiplier)}% dmg${stun}${bleed}`;
    }
    case 'generator':
      return `Strike foes in ${Math.round(scaleValue(skill.radius, r))}px for ${pct(skill.damageMultiplier)}% dmg; restore ${Math.round(scaleValue(skill.manaGain, r))} mana per hit`;
    case 'charge':
      return `Charge ${Math.round(scaleValue(skill.distance, r))}px, hitting all in the way for ${pct(skill.damageMultiplier)}% dmg + ${scaleValue(skill.stunDuration, r).toFixed(1)}s stun`;
    case 'debuff':
      return `Foes in ${Math.round(scaleValue(skill.radius, r))}px take +${Math.round(scaleValue(skill.vulnerablePct, r))}% damage for ${skill.duration}s`;
    case 'heal':
      return `Restore ${Math.round(scaleValue(skill.healPct, r))}% of max life`;
    case 'projectile': {
      const count = skill.count ? Math.round(scaleValue(skill.count, r)) : 1;
      const bits = [
        count > 1
          ? `Fire ${count} bolts for ${pct(skill.damageMultiplier)}% dmg each`
          : `Fire a bolt for ${pct(skill.damageMultiplier)}% dmg`,
      ];
      if (skill.pierce) bits.push(`pierces ${Math.round(scaleValue(skill.pierce, r))}`);
      if (skill.chain) bits.push(`chains ${Math.round(scaleValue(skill.chain, r))}`);
      if (skill.split) bits.push(`splits into ${skill.split}`);
      if (skill.element === 'fire') bits.push('burns');
      if (skill.element === 'frost') bits.push('chills');
      return bits.join(', ');
    }
    case 'groundEffect': {
      const el = skill.element === 'fire' ? 'burning' : skill.element === 'frost' ? 'frozen' : '';
      const burst = skill.burstMultiplier ? `${pct(skill.burstMultiplier)}% on impact, then ` : '';
      return `${burst}${el} ground: ${Math.round(scaleValue(skill.tickDps, r))} dmg/s for ${skill.duration}s`;
    }
    case 'trap': {
      const stun = skill.stunDuration ? `, stun ${scaleValue(skill.stunDuration, r).toFixed(1)}s` : '';
      const el = skill.element === 'fire' ? ', burns' : skill.element === 'frost' ? ', chills' : '';
      return `Set a trap (${Math.round(scaleValue(skill.radius, r))}px) that detonates for ${pct(skill.damageMultiplier)}% dmg${stun}${el}`;
    }
    case 'leap':
      return `Leap ${Math.round(scaleValue(skill.distance, r))}px; landing hits for ${pct(skill.damageMultiplier)}% dmg`;
    case 'execute':
      return `Strike nearest foe: ${pct(skill.damageMultiplierLow)}% dmg below ${Math.round(scaleValue(skill.lifeThresholdPct, r))}% life, else ${Math.round(skill.damageMultiplierHigh * 100)}%`;
    case 'buff': {
      const dmg = scaleValue(skill.damageBonusPct, r);
      const dr = skill.damageReductionPct ? scaleValue(skill.damageReductionPct, r) : 0;
      const parts = [];
      if (dmg) parts.push(`+${Math.round(dmg)}% damage`);
      if (dr) parts.push(`${Math.round(dr)}% damage reduction`);
      return `${parts.join(', ')} for ${skill.duration}s`;
    }
  }
}

/** All skills usable by a class. */
export const skillsForClass = (skills: SkillsFile, classId: ClassId): SkillsFile =>
  skills.filter((s) => s.class === classId);

/** Default bar: the first 6 ACTIVE skills in skills.json order. */
export const defaultActives = (skills: SkillsFile): (string | null)[] => {
  const actives = skills.filter((s) => s.mechanic !== 'passive');
  return Array.from({ length: 6 }, (_, i) => actives[i]?.id ?? null);
};

/** Sums the stat bonuses of the SLOTTED, learned passives at their ranks. */
export function passiveModifiers(
  skills: SkillsFile,
  skillRanks: Record<string, number>,
  slotted: (string | null)[],
): Partial<Record<PassiveStat, number>> {
  const out: Partial<Record<PassiveStat, number>> = {};
  for (const id of slotted) {
    if (!id) continue;
    const skill = skills.find((s) => s.id === id);
    if (!skill || skill.mechanic !== 'passive') continue;
    const rank = rankOf(skill, skillRanks);
    if (rank <= 0) continue;
    for (const [stat, scaling] of Object.entries(skill.modifiers) as [
      PassiveStat,
      { base: number; perRank: number },
    ][]) {
      out[stat] = (out[stat] ?? 0) + scaleValue(scaling, rank);
    }
  }
  return out;
}

/** Resolves slotted ids to defs; unknown ids (removed content) become empty. */
export const resolveLoadout = (actives: (string | null)[], skills: SkillsFile): (SkillData | null)[] =>
  Array.from({ length: 6 }, (_, i) => skills.find((s) => s.id === actives[i]) ?? null);

/**
 * Assigns a skill to a slot. If the skill already sits in another slot the
 * two slots swap, so a skill can never occupy two keys at once.
 */
export function assignSlot(
  actives: (string | null)[],
  slot: number,
  skillId: string | null,
): (string | null)[] {
  const next = [...actives];
  if (skillId !== null) {
    const existing = next.indexOf(skillId);
    if (existing >= 0 && existing !== slot) next[existing] = next[slot] ?? null;
  }
  next[slot] = skillId;
  return next;
}

export type CastBlock = 'unlearned' | 'locked' | 'cooldown' | 'mana';

export function castBlock(
  skill: SkillData,
  opts: { level: number; rank: number; mp: number; cooldownRemaining: number },
): CastBlock | null {
  if (skill.mechanic === 'passive') return 'unlearned'; // never castable from the bar
  if (opts.level < skill.unlockLevel) return 'locked';
  if (opts.rank <= 0) return 'unlearned';
  if (opts.cooldownRemaining > 0) return 'cooldown';
  if (opts.mp < skill.manaCost) return 'mana';
  return null;
}
