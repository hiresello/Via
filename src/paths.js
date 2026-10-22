import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function dbPath() {
  if (process.env.VIA_DB_PATH) return process.env.VIA_DB_PATH;
  if (process.env.VERCEL) return '/tmp/via.sqlite';
  return path.join(rootDir, 'data', 'via.sqlite');
}

/** Agent-store seed (grows here first). Copied into data/ by syncSeedFromStore. */
export function storeSeedPath() {
  if (process.env.VIA_STORE_SEED_PATH) return process.env.VIA_STORE_SEED_PATH;
  return '/cursor/stores/self/docs/hackathon-seed.json';
}

export function seedFilePath() {
  if (process.env.VIA_SEED_PATH) return process.env.VIA_SEED_PATH;
  return path.join(rootDir, 'data', 'hackathon-seed.json');
}

export function publicUrl() {
  const raw = process.env.VIA_PUBLIC_URL || 'http://localhost:8787';
  return raw.replace(/\/$/, '');
}
