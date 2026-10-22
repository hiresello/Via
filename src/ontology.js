import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS facts_type ON facts(type);
`;

/**
 * The only write path. Discord, the thin pages, the ranker, and X all call
 * ontology.write / ontology.query. SQLite is the store.
 */
export function openOntology(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const insert = db.prepare(
    `INSERT INTO facts (id, type, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE facts SET type = ?, payload = ?, updated_at = ? WHERE id = ?`,
  );
  const byId = db.prepare(`SELECT payload, created_at FROM facts WHERE id = ?`);
  const byType = db.prepare(
    `SELECT payload FROM facts WHERE type = ? ORDER BY created_at ASC, id ASC`,
  );

  function write(fact) {
    if (!fact || typeof fact !== 'object') throw new Error('ontology.write requires a fact');
    if (!fact.type) throw new Error('ontology.write requires fact.type');
    if (!fact.id) throw new Error('ontology.write requires fact.id');
    const now = new Date().toISOString();
    const existing = byId.get(fact.id);
    const stored = { ...fact, id: fact.id, type: fact.type };
    if (!existing) stored.created_at = fact.created_at || now;
    else stored.created_at = JSON.parse(existing.payload).created_at || existing.created_at;
    stored.updated_at = now;
    const payload = JSON.stringify(stored);
    if (existing) update.run(stored.type, payload, now, stored.id);
    else insert.run(stored.id, stored.type, payload, stored.created_at, now);
    return stored;
  }

  function query({ type, where } = {}) {
    if (!type) throw new Error('ontology.query requires type');
    const rows = byType.all(type).map((row) => JSON.parse(row.payload));
    if (!where) return rows;
    return rows.filter((row) => matches(row, where));
  }

  return {
    write,
    query,
    close() {
      db.close();
    },
    path: dbFile,
  };
}

function matches(row, where) {
  for (const [key, value] of Object.entries(where)) {
    if (row[key] !== value) return false;
  }
  return true;
}
