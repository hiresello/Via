import fs from 'node:fs';

/**
 * Load .env without overriding variables the host already set.
 * No dotenv dependency. An empty file value must not blank a real key:
 * Vercel injects OPENROUTER_API_KEY before boot, and a shipped `.env`
 * often has `OPENROUTER_API_KEY=`.
 */
export function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    const existing = process.env[key];
    if (existing != null && String(existing).trim() !== '') continue;
    if (!String(value || '').trim()) continue;
    process.env[key] = value;
  }
}
