#!/usr/bin/env node
/** Generate committed share cards for every seed project (offline demo).
 * Syncs from /cursor/stores/self/docs/hackathon-seed.json when present,
 * wipes stale PNGs, regenerates ALL thumbs (Apestron if available).
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveApestronPath } from '../src/discord/render.js';
import { projectIdForSeedRow, readSeedDocument, syncSeedFromStore } from '../src/seed.js';
import { generateProjectThumb, thumbFileName, thumbsDir } from '../src/thumb.js';

const sync = syncSeedFromStore();
if (sync.synced) console.log(`seed synced from ${sync.from}`);

const ape = resolveApestronPath();
console.log(ape ? `display font: ${ape}` : 'display font: Syne (Apestron not found)');

const doc = readSeedDocument();
if (!doc) {
  console.error('Seed missing');
  process.exit(1);
}

const taken = new Set();
const planned = doc.map((row) => {
  const id = projectIdForSeedRow(row, taken);
  return {
    id,
    title: row.title,
    one_liner: row.one_liner,
    hackathon: row.hackathon,
    builders: (row.builders || []).map((b) => ({ display_name: b.name })),
    fileName: thumbFileName(id),
  };
});

const dir = thumbsDir();
fs.mkdirSync(dir, { recursive: true });
const keep = new Set(planned.map((row) => row.fileName));
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.png')) continue;
  if (!keep.has(name)) {
    fs.rmSync(path.join(dir, name), { force: true });
    console.log(`removed stale ${name}`);
  }
}

for (const row of planned) {
  const out = await generateProjectThumb(
    { id: row.id, title: row.title, one_liner: row.one_liner, hackathon: row.hackathon },
    { builders: row.builders },
  );
  console.log(`thumb ${out.file}`);
}
console.log(`generated ${planned.length} thumbs (${keep.size} unique files)`);
if (keep.size !== planned.length) {
  console.error(`ERROR: slug collision — ${planned.length} projects but ${keep.size} files`);
  process.exit(1);
}
