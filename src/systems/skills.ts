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
