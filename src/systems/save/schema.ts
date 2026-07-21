import { z } from 'zod';
import { ItemSlotSchema } from '../../data/schemas/item.ts';
import { ClassSchema } from '../../data/schemas/skill.ts';

// Save format v1. The shape covers everything Milestone 0.4 lists —
// character, gear, bag, skill ranks, gold, world state — even though some
// owning systems (items in gameplay, XP/leveling, quests, corruption) land
// in later milestones. Until then those fields ride along at their defaults;
// the format never needs to change shape when the systems arrive, only new
// migrations when it genuinely evolves.

export const CURRENT_SAVE_VERSION = 10; // v10 (m2.4): collected relic fragments

// Per-character quest progress (m2.1). `progress[questId]` is a parallel array
// of per-objective counts; `tracked` is the pinned quest for the HUD tracker.
export const QuestStateSchema = z.object({
  active: z.array(z.string()),
  completed: z.array(z.string()),
  progress: z.record(z.string(), z.array(z.number().int().nonnegative())),
  tracked: z.string().nullable(),
});
export type QuestState = z.infer<typeof QuestStateSchema>;

export const emptyQuestState = (): QuestState => ({ active: [], completed: [], progress: {}, tracked: null });

// An item *instance* the player owns (rolled affixes and all) — distinct
// from the item content definitions in data/items.json.
export const ItemInstanceSchema = z.object({
  slot: ItemSlotSchema,
  name: z.string(),
  base: z.number(),
  rarity: z.string(),
  affixes: z.array(z.object({ key: z.string(), value: z.number() })),
  power: z.string().optional(), // legendary power key, if any
  // Durability (since v8): both optional so pre-v8 items are simply indestructible.
  durability: z.number().optional(),
  maxDurability: z.number().optional(),
});
export type ItemInstance = z.infer<typeof ItemInstanceSchema>;

export const SaveSchema = z.object({
  saveVersion: z.literal(CURRENT_SAVE_VERSION),
  updatedAt: z.number(), // epoch ms
  character: z.object({
    class: ClassSchema.default('warrior'), // chosen at new game (since v5)
    level: z.number().int().min(1),
    xp: z.number().nonnegative(),
    gold: z.number().nonnegative(),
    // Derived stats (dmg, crit, maxHp...) are intentionally NOT stored —
    // they recompute from level + gear, so storing them would only let
    // them drift out of sync.
  }),
  gear: z.partialRecord(ItemSlotSchema, ItemInstanceSchema.nullable()),
  bag: z.array(ItemInstanceSchema),
  stash: z.array(ItemInstanceSchema), // shared storage chest (since v7)
  materials: z.record(z.string(), z.number().int().nonnegative()), // crafting stock (since v9)
  relics: z.array(z.string()), // collected relic-fragment ids (since v10)
  skillRanks: z.record(z.string(), z.number().int().min(0)),
  // Which skills sit in the 6 active slots (keys 1-6); null = empty slot.
  // All-null means "never customised" and the scene seeds the default bar.
  loadout: z.object({
    actives: z.array(z.string().nullable()).length(6),
    passives: z.array(z.string().nullable()).length(6), // slotted always-on passives
  }),
  quests: QuestStateSchema, // per-character quest progress (since v6)
  world: z.object({
    currentZone: z.string(), // zone id from data/zones.json (since v2)
    questFlags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
    killedBosses: z.array(z.string()),
    discoveredZones: z.array(z.string()),
    corruption: z.number().min(0).max(100),
  }),
});
export type SaveData = z.infer<typeof SaveSchema>;

export function defaultSave(now: number = Date.now()): SaveData {
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    updatedAt: now,
    character: { class: 'warrior', level: 1, xp: 0, gold: 0 },
    gear: {},
    bag: [],
    stash: [],
    materials: {},
    relics: [],
    skillRanks: {},
    loadout: {
      actives: [null, null, null, null, null, null],
      passives: [null, null, null, null, null, null],
    },
    quests: emptyQuestState(),
    world: {
      currentZone: 'overworld',
      questFlags: {},
      killedBosses: [],
      discoveredZones: ['overworld'],
      corruption: 0,
    },
  };
}
