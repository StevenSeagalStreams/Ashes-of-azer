import { migrateAndValidate, SaveError } from './migrations.ts';
import type { SaveData } from './schema.ts';

// Export/import a save as a base64 string — the roadmap's "cheap cloud-save
// substitute + debugging tool". Unicode-safe (TextEncoder before btoa).

export function exportSave(data: SaveData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function importSave(encoded: string): SaveData {
  let json: string;
  try {
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new SaveError('not a valid save string (base64 decode failed)');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('not a valid save string (JSON parse failed)');
  }
  return migrateAndValidate(raw);
}
