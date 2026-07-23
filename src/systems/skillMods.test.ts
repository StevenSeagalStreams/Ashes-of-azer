import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import type { SkillData, SkillMod } from '../data/schemas/index.ts';
import { applySkillMods, equippedSkillMods } from './skillMods.ts';
import type { ItemInstance } from './save/schema.ts';

const skills = loadGameData().skills;
const byId = (id: string): SkillData => {
  const s = skills.find((x) => x.id === id);
  if (!s) throw new Error(`missing skill ${id}`);
  return s;
};

describe('applySkillMods', () => {
  it('returns the same object when nothing targets the skill', () => {
    const fireball = byId('fireball');
    expect(applySkillMods(fireball, [{ skill: 'other', mod: 'split', value: 2, op: 'add' }])).toBe(fireball);
  });

  it('never mutates the input skill', () => {
    const fireball = byId('fireball');
    const before = structuredClone(fireball);
    applySkillMods(fireball, [{ skill: 'fireball', mod: 'split', value: 3, op: 'add' }]);
    expect(fireball).toEqual(before);
  });

  it('creates an absent numeric field (grants split)', () => {
    const out = applySkillMods(byId('fireball'), [{ skill: 'fireball', mod: 'split', value: 2, op: 'add' }]);
    expect(out.mechanic === 'projectile' && out.split).toBe(2);
  });

  it('creates an absent RankScaling field (grants chaining)', () => {
    const out = applySkillMods(byId('fireball'), [{ skill: 'fireball', mod: 'chain', value: 2, op: 'add' }]);
    if (out.mechanic !== 'projectile') throw new Error('wrong mechanic');
    expect(out.chain).toEqual({ base: 2, perRank: 0 });
  });

  it('creates an absent boolean field (grants return)', () => {
    const out = applySkillMods(byId('fireball'), [{ skill: 'fireball', mod: 'returns', value: 1, op: 'add' }]);
    expect(out.mechanic === 'projectile' && (out as { returns?: boolean }).returns).toBe(true);
  });

  it('adds to an existing RankScaling base (Whirlwind radius)', () => {
    const ww = byId('whirlwind');
    if (ww.mechanic !== 'shockwave') throw new Error('setup');
    const out = applySkillMods(ww, [{ skill: 'whirlwind', mod: 'radius', value: 20, op: 'add' }]);
    if (out.mechanic !== 'shockwave') throw new Error('wrong mechanic');
    expect(out.radius.base).toBe(ww.radius.base + 20);
    expect(out.radius.perRank).toBe(ww.radius.perRank); // perRank untouched
  });

  it('adds to an existing RankScaling on Multi Shot count', () => {
    const ms = byId('multi_shot');
    if (ms.mechanic !== 'projectile' || !ms.count) throw new Error('setup');
    const out = applySkillMods(ms, [{ skill: 'multi_shot', mod: 'count', value: 2, op: 'add' }]);
    if (out.mechanic !== 'projectile' || !out.count) throw new Error('wrong mechanic');
    expect(out.count.base).toBe(ms.count.base + 2);
  });

  it('supports op:set to overwrite a plain number', () => {
    const out = applySkillMods(byId('fireball'), [{ skill: 'fireball', mod: 'split', value: 5, op: 'set' }]);
    expect(out.mechanic === 'projectile' && out.split).toBe(5);
  });

  it('ignores a mod for an absent field it cannot shape', () => {
    const fb = byId('fireball');
    const out = applySkillMods(fb, [{ skill: 'fireball', mod: 'nonsenseField', value: 9, op: 'add' }]);
    expect((out as unknown as Record<string, unknown>).nonsenseField).toBeUndefined();
  });

  it('stacks multiple mods (the Fireball example chain)', () => {
    const mods: SkillMod[] = [
      { skill: 'fireball', mod: 'split', value: 2, op: 'add' },
      { skill: 'fireball', mod: 'chain', value: 2, op: 'add' },
      { skill: 'fireball', mod: 'returns', value: 1, op: 'add' },
    ];
    const out = applySkillMods(byId('fireball'), mods);
    if (out.mechanic !== 'projectile') throw new Error('wrong mechanic');
    expect(out.split).toBe(2);
    expect(out.chain).toEqual({ base: 2, perRank: 0 });
    expect((out as { returns?: boolean }).returns).toBe(true);
    expect(out.element).toBe('fire'); // Fireball already burns — untouched
  });
});

describe('equippedSkillMods', () => {
  const legendaries = loadGameData().items.legendaries;

  it('gathers mods from equipped legendaries by their power key', () => {
    const withMods = legendaries.find((l) => l.skillMods.length > 0);
    if (!withMods) return; // no skill-modifying legendaries authored yet
    const item: ItemInstance = {
      slot: withMods.slot,
      name: withMods.name,
      base: 5,
      rarity: 'legendary',
      affixes: [],
      power: withMods.power,
    };
    const mods = equippedSkillMods({ [withMods.slot]: item }, legendaries);
    expect(mods).toEqual(withMods.skillMods);
  });

  it('ignores gear with no legendary power', () => {
    const plain: ItemInstance = { slot: 'Ring', name: 'Copper Ring', base: 1, rarity: 'white', affixes: [] };
    expect(equippedSkillMods({ Ring: plain }, legendaries)).toEqual([]);
  });
});
