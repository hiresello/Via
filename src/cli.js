import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadEnv } from './env.js';
import { dbPath, rootDir } from './paths.js';
import { openOntology } from './ontology.js';
import { readSeedDocument, seedOntology } from './seed.js';
import { likeProject, presentBoard, rankBoard } from './service.js';
import { handle } from './web/server.js';

loadEnv(path.join(rootDir, '.env'));

const command = process.argv[2] || 'demo';
const forceStub = !process.env.OPENROUTER_API_KEY;

if (command === 'demo') {
  const file = dbPath();
  for (const suffix of ['', '-shm', '-wal']) {
    const target = file + suffix;
    if (fs.existsSync(target)) fs.rmSync(target);
  }
  const ontology = openOntology(file);
  const doc = readSeedDocument();
  if (!doc) {
    console.error('Seed file missing. Refusing to invent projects.');
    process.exit(1);
  }
  const seeded = await seedOntology(ontology, doc);
  const board = await rankBoard(ontology, { forceStub });
  printBoard(board);
  console.log(`seeded projects=${seeded.projects} people=${seeded.people} events=${seeded.events} organizers=${seeded.organizers}`);
  console.log(`rank model=${board.model} chosen_by=${board.chosen_by}`);
  ontology.close();
  const port = Number(process.env.PORT || 8787);
  http.createServer((req, res) => { handle(req, res); }).listen(port, () => {
    console.log(`Leaderboard http://127.0.0.1:${port}/  (no API keys required; stub ranks when OPENROUTER_API_KEY is unset)`);
  });
} else if (command === 'seed' || command === 'rank') {
  const ontology = openOntology(dbPath());
  if (command === 'seed' || !ontology.query({ type: 'Project' }).length) {
    const seeded = await seedOntology(ontology);
    console.log(seeded.missing ? 'seed file missing — wrote nothing' : `seeded ${seeded.projects} projects`);
  }
  if (command === 'rank') {
    const board = await rankBoard(ontology, { forceStub });
    printBoard(board);
  }
  ontology.close();
} else if (command === 'like') {
  const [, , , projectId, userId] = process.argv;
  const ontology = openOntology(dbPath());
  const board = await likeProject(ontology, { projectId, userId }, { forceStub });
  printBoard(board);
  ontology.close();
} else {
  console.error('Commands: demo, seed, rank, like <projectId> <userId>');
  process.exit(1);
}

function printBoard(board) {
  for (const row of board.rows) {
    const mark = row.capped ? 'cap' : 'ok';
    console.log(`${String(row.rank).padStart(2, ' ')}  ${row.score}  ${mark}  ${row.project.title}  likes=${row.likes}`);
    console.log(`    ${row.reason}`);
  }
}
