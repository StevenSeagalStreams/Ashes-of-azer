import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/gameData.ts';
import { canSocket, isSocketable, matchRuneword, maxSockets, openSockets, pickRune, rollSockets, socketRune, type Rng } from './sockets.ts';
import type { ItemInstance } from './save/schema.ts';

const { items } = loadGameData();

const scriptRng = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('sockets', () => {
  it('caps socket count by item level', () => {
    expect(maxSockets(1)).toBe(1);
    expect(maxSockets(15)).toBe(2);
    expect(maxSockets(50)).toBe(3);
  });

  it('only weapons/body/helms can carry sockets', () => {
    expect(isSocketable('Weapon')).toBe(true);
    expect(isSocketable('Chest')).toBe(true);
    expect(isSocketable('Helmet')).toBe(true);
    expect(isSocketable('Ring')).toBe(false);
    expect(isSocketable('Boots')).toBe(false);
  });

  it('never rolls sockets on a non-socketable slot', () => {
    expect(rollSockets('Ring', 99, scriptRng([0, 0, 0]))).toBe(0);
  });

  it('rolls a level-capped socket count (low rolls stop the chain)', () => {
    // All rolls pass, but ilvl caps the count.
    expect(rollSockets('Weapon', 50, scriptRng([0, 0, 0]))).toBe(3);
    expect(rollSockets('Weapon', 15, scriptRng([0, 0, 0]))).toBe(2); // capped at 2 by ilvl
    // A high first roll means no sockets.
    expect(rollSockets('Weapon', 50, scriptRng([0.99]))).toBe(0);
  });

  it('picks runes by weight (low runes are far commoner)', () => {
    const rng = scriptRng([0.0]); // first slice of the weighted range → the heaviest rune
    const r = pickRune(items.runes, rng);
    const heaviest = items.runes.reduce((mx, x) => (x.weight > mx.weight ? x : mx));
    expect(r?.id).toBe(heaviest.id);
  });

  it('inserts a rune into the next open socket, up to the socket count', () => {
    const base: ItemInstance = { slot: 'Weapon', name: 'Blade', base: 7, rarity: 'white', affixes: [], sockets: 2, socketed: [] };
    expect(openSockets(base)).toBe(2);
    const one = socketRune(base, 'rune_el');
    expect(one.socketed).toEqual(['rune_el']);
    expect(openSockets(one)).toBe(1);
    const two = socketRune(one, 'rune_tir');
    expect(two.socketed).toEqual(['rune_el', 'rune_tir']);
    expect(canSocket(two)).toBe(false);
    // A full item rejects further runes (returns unchanged).
    expect(socketRune(two, 'rune_ort')).toBe(two);
  });

  it('an item with no sockets cannot be socketed', () => {
    const plain: ItemInstance = { slot: 'Weapon', name: 'Stick', base: 3, rarity: 'white', affixes: [] };
    expect(canSocket(plain)).toBe(false);
    expect(socketRune(plain, 'rune_el')).toBe(plain);
  });
});

describe('matchRuneword', () => {
  const rws = items.runewords;
  const steel = rws.find((w) => w.id === 'rw_steel')!; // [tir, el] in a Weapon
  const weapon = (socketed: string[], sockets = socketed.length): ItemInstance => ({
    slot: 'Weapon', name: 'Base', base: 7, rarity: 'white', sockets, socketed, affixes: [],
  });

  it('matches an exact ordered rune sequence in an allowed, fully-socketed base', () => {
    expect(matchRuneword(weapon([...steel.runes]), rws)?.id).toBe('rw_steel');
  });

  it('rejects the wrong rune order (runewords are order-exact)', () => {
    expect(matchRuneword(weapon([...steel.runes].reverse()), rws)).toBeNull();
  });

  it('rejects an item that is not fully socketed', () => {
    expect(matchRuneword(weapon([steel.runes[0]!], 2), rws)).toBeNull(); // one open socket
  });

  it('rejects the right runes in the wrong base slot', () => {
    const helmet: ItemInstance = { slot: 'Helmet', name: 'Helm', base: 4, rarity: 'white', sockets: 2, socketed: [...steel.runes], affixes: [] };
    expect(matchRuneword(helmet, rws)).toBeNull(); // Steel only forms in a Weapon
  });

  it('an unsocketed item spells nothing', () => {
    expect(matchRuneword(weapon([], 0), rws)).toBeNull();
  });
});
