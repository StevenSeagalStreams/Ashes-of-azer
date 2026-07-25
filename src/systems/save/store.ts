import { migrateAndValidate } from './migrations.ts';
import type { SaveData } from './schema.ts';

// localStorage-backed save slots. Storage is injected so tests run against
// an in-memory implementation — no jsdom needed for full coverage.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

const keyFor = (slot: SaveSlot): string => `azer:save:${slot}`;

export class SaveStore {
  constructor(private readonly storage: StorageLike) {}

  /** Persists a save; stamps updatedAt. */
  save(slot: SaveSlot, data: SaveData): void {
    this.storage.setItem(keyFor(slot), JSON.stringify({ ...data, updatedAt: Date.now() }));
  }

  /**
   * Returns the slot's save, or null if empty. Throws SaveError on corrupt
   * or unmigratable data — callers decide whether to start fresh (and can
   * tell "empty" apart from "damaged").
   */
  load(slot: SaveSlot): SaveData | null {
    const rawStr = this.storage.getItem(keyFor(slot));
    if (rawStr === null) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(rawStr);
    } catch {
      raw = undefined; // fall through to migrateAndValidate's SaveError
    }
    return migrateAndValidate(raw);
  }

  delete(slot: SaveSlot): void {
    this.storage.removeItem(keyFor(slot));
  }

  /** Slot summaries for a future load-game menu. */
  list(): { slot: SaveSlot; save: SaveData | null }[] {
    return SAVE_SLOTS.map((slot) => {
      try {
        return { slot, save: this.load(slot) };
      } catch {
        return { slot, save: null }; // corrupt slots list as empty; loading them still throws
      }
    });
  }
}
