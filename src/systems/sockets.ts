// Sockets + runes (Milestone 4.x, D2 itemization). Pure helpers: rolling socket
// counts onto white bases, the weighted rune drop table, and inserting a rune
// into an item. Runeword matching lands in a later box; for now a socketed rune
// simply grants its own affixes (see gearStats). RNG is injected for tests.

import type { ItemSlot, RuneData } from '../data/schemas/index.ts';
import { SOCKETABLE_SLOTS } from '../data/schemas/index.ts';
import type { ItemInstance } from './save/schema.ts';

export type Rng = () => number;

/** The most sockets an item of this level may roll (D2: higher ilvl → more). */
export function maxSockets(ilvl: number): number {
  if (ilvl < 8) return 1;
  if (ilvl < 20) return 2;
  return 3;
}

/** True if this slot can ever carry sockets (weapons/body/helms only). */
export const isSocketable = (slot: ItemSlot): boolean => SOCKETABLE_SLOTS.includes(slot);

/**
 * Rolls a socket count for a fresh white base: capped by item level, biased
 * toward few (most white items have 0–1). Non-socketable slots always return 0.
 * D2-style: sockets are a bonus that makes an otherwise-plain white worth keeping.
 */
export function rollSockets(slot: ItemSlot, ilvl: number, rng: Rng): number {
  if (!isSocketable(slot)) return 0;
  const cap = maxSockets(ilvl);
  // Each successive socket is progressively less likely; stop at the first miss.
  const chances = [0.55, 0.3, 0.12];
  let n = 0;
  while (n < cap && rng() < chances[n]!) n++;
  return n;
}

/** Weighted pick of one rune from the drop table (null if the table is empty). */
export function pickRune(runes: readonly RuneData[], rng: Rng): RuneData | null {
  const total = runes.reduce((s, r) => s + r.weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const r of runes) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return runes[runes.length - 1] ?? null;
}

/** Open socket count = total sockets minus runes already inserted. */
export const openSockets = (item: ItemInstance): number =>
  Math.max(0, (item.sockets ?? 0) - (item.socketed?.length ?? 0));

/** Whether a rune can be inserted into this item right now. */
export const canSocket = (item: ItemInstance): boolean => openSockets(item) > 0;

/**
 * Inserts a rune into the item's next open socket, returning a new item (pure).
 * Returns the item unchanged if it has no open socket.
 */
export function socketRune(item: ItemInstance, runeId: string): ItemInstance {
  if (!canSocket(item)) return item;
  return { ...item, socketed: [...(item.socketed ?? []), runeId] };
}
