// Pure skill/XP math ported from the prototype. Unit tested.

import type { SkillData, SkillsFile } from '../data/schemas/index.ts';

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
    case 'shockwave': {
      const stun = skill.stunDuration ? `, stun ${scaleValue(skill.stunDuration, r).toFixed(1)}s` : '';
      return `Hit foes in ${Math.round(scaleValue(skill.radius, r))}px for ${pct(skill.damageMultiplier)}% dmg${stun}`;
    }
    case 'leap':
      return `Leap ${Math.round(scaleValue(skill.distance, r))}px; landing hits for ${pct(skill.damageMultiplier)}% dmg`;
    case 'execute':
      return `Strike nearest foe: ${pct(skill.damageMultiplierLow)}% dmg below ${Math.round(scaleValue(skill.lifeThresholdPct, r))}% life, else ${Math.round(skill.damageMultiplierHigh * 100)}%`;
    case 'buff':
      return `+${Math.round(scaleValue(skill.damageBonusPct, r))}% damage for ${skill.duration}s`;
  }
}

export type CastBlock = 'unlearned' | 'locked' | 'cooldown' | 'mana';

export function castBlock(
  skill: SkillData,
  opts: { level: number; rank: number; mp: number; cooldownRemaining: number },
): CastBlock | null {
  if (opts.level < skill.unlockLevel) return 'locked';
  if (opts.rank <= 0) return 'unlearned';
  if (opts.cooldownRemaining > 0) return 'cooldown';
  if (opts.mp < skill.manaCost) return 'mana';
  return null;
}
