import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { decide, OPENROUTER_MODEL, OPENROUTER_URL } from '../src/decision.js';
import { loadEnv } from '../src/env.js';
import { EMBED_COLOR, projectCard } from '../src/discord/card.js';
import { cardHtml } from '../src/discord/render.js';
import { openOntology } from '../src/ontology.js';
import { RANK_INSTRUCTIONS, rankProjects } from '../src/ranker.js';
import { readSeedDocument, seedOntology } from '../src/seed.js';
import { likeProject, presentBoard, rankBoard } from '../src/service.js';
import { renderBoard, renderBuilders, renderPrivacy, renderProject, renderTerms } from '../src/web/html.js';
import { handle } from '../src/web/server.js';
import { rootDir } from '../src/paths.js';
import { slug } from '../src/slug.js';

const BANNED = [
  '2111634849899663828',
  'not building a media company',
  'tim.blog/2025/09/26',
  'mai-decision-1',
  '/chat/completions',
  'x_api_key',
  'x_access_token',
];

test('seed → rank → like moves a clearing project, a pathless project stays off #1, restart reloads', async () => {
  const doc = readSeedDocument();
  assert.ok(doc, 'hackathon-seed.json is required');
  assert.ok(doc.length >= 11, `expected ≥11 seed projects, got ${doc.length}`);
  const n = doc.length;
  const db = path.join(os.tmpdir(), `via-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const ontology = openOntology(db);
  const seeded = await seedOntology(ontology, doc);
  assert.equal(seeded.projects, n);
  assert.equal(ontology.query({ type: 'Project' }).length, n);
  for (const project of ontology.query({ type: 'Project' })) {
    assert.ok(project.thumbnail_url, `${project.title} missing thumbnail_url`);
    assert.ok(project.image_path, `${project.title} missing image_path`);
    assert.match(project.image_path, /public\/thumbs\/.+\.png$/);
    const disk = path.join(rootDir, project.image_path);
    assert.ok(fs.existsSync(disk), `committed thumb missing for ${project.title}: ${project.image_path}`);
  }

  const titles = new Set(doc.map((row) => row.title));
  const bySource = new Map(doc.map((row) => [row.source_url || row.title, row]));
  const projectIds = ontology.query({ type: 'Project' }).map((p) => p.id);
  assert.equal(new Set(projectIds).size, n, 'duplicate Project ids after seed');
  for (const project of ontology.query({ type: 'Project' })) {
    assert.ok(titles.has(project.title));
    const seedRow = bySource.get(project.source_url) || bySource.get(project.title);
    assert.ok(seedRow, `no seed row for ${project.id}`);
    assert.equal(project.demo_url ?? null, seedRow.demo_url ?? null);
  }
  const city = ontology.query({ type: 'Project' }).find((row) => row.title === 'CityZenith');
  assert.equal(city.demo_url, null);
  assert.equal(city.repo_url, null);
  assert.deepEqual(city.organizers, []);
  const builder = ontology.query({ type: 'Person' }).find((row) => row.id === city.builder_ids[0]);
  assert.equal(builder.discord_id, null);
  assert.equal(builder.github, null);
  const dhub = ontology.query({ type: 'Project' }).find((row) => row.title === 'dHub');
  assert.deepEqual(dhub.organizers, ['ETHGlobal']);
  assert.ok(dhub.demo_url);

  const first = await rankBoard(ontology, { forceStub: true });
  assert.equal(first.model, 'stub');
  assert.equal(first.chosen_by, 'stub');
  assert.equal(first.rows[0].capped, false);
  assert.ok(first.rows[0].project.demo_url || first.rows[0].project.repo_url);

  for (const row of first.rows) {
    assert.equal(row.quote, undefined);
    assert.ok(row.builders.length);
    assert.ok(row.project.hackathon);
  }
  assert.equal(ontology.query({ type: 'Quote' }).length, 0);

  const capped = first.rows.find((row) => row.capped);
  assert.ok(capped);
  const people = ontology.query({ type: 'Person' });
  for (const person of people.slice(0, 8)) {
    await likeProject(ontology, { userId: person.id, projectId: capped.project.id }, { forceStub: true });
  }
  const afterCap = presentBoard(ontology);
  assert.notEqual(afterCap.rows[0].project.id, capped.project.id);
  assert.equal(afterCap.rows.find((row) => row.project.id === capped.project.id).capped, true);
  assert.ok(afterCap.snapshot.id !== first.snapshot.id);

  const clear = first.rows.filter((row) => !row.capped);
  const low = [...clear].sort((a, b) => a.score - b.score)[0];
  const lowBefore = first.rows.findIndex((row) => row.project.id === low.project.id);
  for (const person of people.slice(0, 8)) {
    await likeProject(ontology, { userId: person.id, projectId: low.project.id }, { forceStub: true });
  }
  const moved = presentBoard(ontology);
  const lowAfter = moved.rows.findIndex((row) => row.project.id === low.project.id);
  assert.ok(lowAfter < lowBefore, `expected ${low.project.title} to rise, ${lowBefore} -> ${lowAfter}`);
  assert.ok(moved.rows[0].project.demo_url || moved.rows[0].project.repo_url);

  const card = projectCard(moved.rows[0]);
  assert.equal(card.embeds[0].color, EMBED_COLOR);
  assert.match(card.embeds[0].description, /Hackathon:/);
  assert.ok(card.embeds[0].image?.url, 'Discord embed must set image to the project thumb');
  assert.match(card.embeds[0].image.url, /\/thumbs\/.+\.png/);
  assert.equal(card.components[0].components[0].custom_id, `via:like:${moved.rows[0].project.id}`);
  const projectPage = renderProject(moved.rows[0]);
  assert.match(projectPage, /property="og:image"/);
  assert.match(projectPage, /name="twitter:card" content="summary_large_image"/);
  assert.match(projectPage, /\/thumbs\/.+\.png/);
  const html = renderBoard(moved);
  assert.match(html, /via-ui\.css/);
  assert.match(html, /via-field/);
  assert.match(html, /via-card--rank1/);
  assert.match(html, /via-btn--primary/);
  assert.match(html, /Apestron Trial Version/);
  assert.doesNotMatch(html, /Syne/);
  assert.doesNotMatch(html, /Via Display/);
  assert.doesNotMatch(html, /Signing as/i);
  assert.doesNotMatch(html, /ORGANIZERS/i);
  assert.doesNotMatch(html, /A stranger can open one path/);
  assert.doesNotMatch(html, /text-decoration:\s*underline/);
  assert.match(html, /font-weight:\s*400/);
  assert.doesNotMatch(html, /font-weight:\s*700/);
  assert.doesNotMatch(html, /font-family:\s*Inter\b|"Inter",|'Inter'|Via Display/);
  assert.doesNotMatch(html, /not building a media company/i);
  assert.equal((html.match(/like-btn/g) || []).length, moved.rows.length);
  assert.doesNotMatch(html, /<select name="signal"/);
  assert.match(html, /via-thumb/);
  assert.ok((html.match(/class="via-thumb"/g) || []).length >= moved.rows.length);
  for (const row of moved.rows) {
    assert.match(html, new RegExp(`/thumbs/${row.project.id.replace(/^prj_/, '')}\\.png`));
  }
  const cardMarkup = cardHtml(moved.rows[0]);
  assert.ok(cardMarkup.includes(moved.rows[0].project.title.toLocaleUpperCase('en-US')));

  ontology.close();
  const reopened = openOntology(db);
  assert.equal(reopened.query({ type: 'Project' }).length, n);
  assert.equal(reopened.query({ type: 'Quote' }).length, 0);
  const likes = reopened.query({ type: 'Like' }).filter((row) => !row.retracted);
  assert.ok(likes.length >= 8);
  const again = presentBoard(reopened);
  assert.equal(again.rows[0].project.id, moved.rows[0].project.id);
  assert.equal(again.rows.find((row) => row.project.id === low.project.id).likes, 8);
  reopened.close();
  fs.rmSync(db, { force: true });
});

test('every project has a thumb', async () => {
  const doc = readSeedDocument();
  assert.ok(doc?.length >= 11, 'seed must list every project');
  const thumbsRoot = path.join(rootDir, 'public', 'thumbs');
  const onDisk = fs.readdirSync(thumbsRoot).filter((n) => n.endsWith('.png'));
  assert.equal(onDisk.length, doc.length, 'committed thumbs must match seed size');
  for (const row of doc) {
    const file = path.join(thumbsRoot, `${slug(row.title)}.png`);
    assert.ok(fs.existsSync(file), `missing committed thumb ${file}`);
    assert.ok(fs.statSync(file).size > 1000, `thumb too small: ${file}`);
  }
  const db = path.join(os.tmpdir(), `via-thumbs-${Date.now()}.sqlite`);
  const ontology = openOntology(db);
  await seedOntology(ontology, doc);
  assert.equal(ontology.query({ type: 'Project' }).length, doc.length);
  for (const project of ontology.query({ type: 'Project' })) {
    assert.ok(project.thumbnail_url && project.image_path, `${project.title} missing thumb fields`);
  }
  ontology.close();
  fs.rmSync(db, { force: true });
});

test('ranker prompt is the §10 relevance stack', () => {
  assert.match(RANK_INSTRUCTIONS, /In-window delta/);
  assert.match(RANK_INSTRUCTIONS, /One runnable path/);
  assert.match(RANK_INSTRUCTIONS, /Hard part finished/);
  assert.match(RANK_INSTRUCTIONS, /Load-bearing constraint/);
  assert.match(RANK_INSTRUCTIONS, /Named owner of the hard part/);
  assert.match(RANK_INSTRUCTIONS, /Reasoned community likes/);
  assert.match(RANK_INSTRUCTIONS, /Visual polish/);
  assert.match(RANK_INSTRUCTIONS, /Sponsor and “powered by” walls/);
  assert.match(RANK_INSTRUCTIONS, /do not lift a capped project/);
  assert.match(RANK_INSTRUCTIONS, /Rank by how clearly a stranger can see a real slice finished under this event’s clock/);
});

test('no X posting, and no chat-completions client', () => {
  const roots = [path.join(rootDir, 'src'), path.join(rootDir, 'README.md'), path.join(rootDir, '.env.example')];
  const files = [];
  for (const root of roots) {
    if (fs.statSync(root).isFile()) {
      files.push(root);
      continue;
    }
    for (const entry of fs.readdirSync(root, { recursive: true })) {
      const full = path.join(root, entry);
      if (fs.statSync(full).isFile() && /\.(js|md|example|json)$/.test(full)) files.push(full);
    }
  }
  assert.ok(!fs.existsSync(path.join(rootDir, 'src/corpus.js')));
  assert.ok(!fs.existsSync(path.join(rootDir, 'src/x.js')));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of BANNED) {
      assert.ok(!text.toLowerCase().includes(needle.toLowerCase()), `${file} still contains ${needle}`);
    }
  }
  const client = fs.readFileSync(path.join(rootDir, 'src/decision.js'), 'utf8');
  assert.match(client, /microsoft\/microsoft-decision-1/);
  assert.match(client, /\/api\/v1\/systemone/);
});

test('terms and privacy pages cover Discord portal facts', () => {
  const terms = renderTerms();
  assert.match(terms, /via-field/);
  assert.match(terms, /Terms/);
  const privacy = renderPrivacy();
  assert.match(privacy, /Discord user id/i);
  assert.match(privacy, /opt-in profile/i);
  assert.match(privacy, /likes/i);
  assert.match(privacy, /intro/i);
  assert.match(privacy, /speaker/i);
  assert.match(privacy, /no secret scraping/i);
  assert.match(privacy, /does not scrape/i);
});

test('OpenRouter 404 on microsoft/microsoft-decision-1 stays on stub and names the slug', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  const urls = [];
  try {
    const decision = await decide({
      state: { ok: true },
      questions: {
        ok: { type: 'noul', instructions: 'test', criteria: { true: 'yes', false: 'no' } },
      },
      fetchImpl: async (url, init) => {
        urls.push(url);
        const body = JSON.parse(init.body);
        assert.equal(body.model, OPENROUTER_MODEL);
        assert.equal(body.questions.ok.type, 'noul');
        assert.equal(body.messages, undefined);
        return { status: 404, ok: false, text: async () => 'Not Found' };
      },
    });
    assert.equal(decision.model, 'stub');
    assert.match(decision.rejected || '', /microsoft\/microsoft-decision-1/);
    assert.equal(OPENROUTER_MODEL, 'microsoft/microsoft-decision-1');
    assert.equal(urls[0], OPENROUTER_URL);
    assert.equal(urls.length, 2);
  } finally {
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('System One scores cannot lift a pathless project over a path', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  try {
    const projects = [
      { id: 'path', title: 'Path', demo_url: 'https://example.com/demo', hackathon: 'Hack', year: 2025, one_liner: 'A working slice', builder_ids: ['p'] },
      { id: 'none', title: 'None', demo_url: null, repo_url: null, hackathon: 'Hack', year: 2025, one_liner: 'No path', builder_ids: ['p'] },
    ];
    const ranked = await rankProjects({ query: () => [] }, projects, {
      fetchImpl: async (url, init) => {
        assert.match(url, /systemone/);
        const body = JSON.parse(init.body);
        assert.equal(body.questions.path.type, 'score');
        assert.equal(body.questions.none.type, 'score');
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({
            model: 'microsoft/microsoft-decision-1',
            answers: {
              path: { type: 'score', score: 0.2 },
              none: { type: 'score', score: 0.99 },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      },
    });
    assert.equal(ranked.model, OPENROUTER_MODEL);
    const top = [...ranked.ordered].sort((a, b) => b.score - a.score)[0];
    assert.equal(top.project_id, 'path');
    const capped = ranked.ordered.find((row) => row.project_id === 'none');
    assert.equal(capped.capped, true);
    assert.ok(capped.score <= 39);
  } finally {
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('BUILDS + BUILDERS pages: logo, favicon, medals, no BAR label, cached System One scores', async () => {
  const { presentBuilders, submitProject } = await import('../src/service.js');
  const { renderBuilders } = await import('../src/web/html.js');
  const db = path.join(os.tmpdir(), `via-ui-${Date.now()}.sqlite`);
  const ontology = openOntology(db);
  await seedOntology(ontology, readSeedDocument());
  const board = await rankBoard(ontology, { forceStub: true });
  const html = renderBoard(board);
  assert.match(html, /<h1 class="via-display">BUILDS<\/h1>/);
  assert.match(html, /src="\/via-discord-icon-512\.png"/);
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.png"/);
  assert.match(html, /is-gold/);
  assert.match(html, /is-silver/);
  assert.match(html, /is-bronze/);
  assert.match(html, /via-bar__fill/);
  assert.doesNotMatch(html, />\s*Bar\s*</i);
  assert.match(html, /unicode-range: U\+0030-0039/);
  const builders = presentBuilders(ontology, board);
  assert.ok(builders.length > 0);
  assert.ok(builders[0].score >= builders[builders.length - 1].score);
  const people = renderBuilders(builders, board);
  assert.match(people, /<h1 class="via-display">BUILDERS<\/h1>/);
  assert.doesNotMatch(people, /\bBAR\b/);
  for (const file of ['via-discord-icon-512.png', 'favicon.png', 'apple-touch-icon.png']) {
    assert.ok(fs.existsSync(path.join(rootDir, 'public', file)), `${file} missing`);
  }
  await assert.rejects(() => submitProject(ontology, { title: 'Bad link', demo_url: 'javascript:alert(1)' }), /http\(s\)/);
  const { renderMe } = await import('../src/web/html.js');
  const me = renderMe(null, null, { next: '/#p-canopy', like: 'prj_canopy' });
  assert.match(me, /class="via-notice"/);
  assert.match(me, /name="next" value="\/#p-canopy"/);
  assert.match(me, /name="like" value="prj_canopy"/);

  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  let calls = 0;
  let asked = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    asked += Object.keys(body.questions).length;
    const answers = Object.fromEntries(Object.keys(body.questions).map((id) => [id, { type: 'score', score: 0.5 }]));
    return { status: 200, ok: true, text: async () => JSON.stringify({ model: OPENROUTER_MODEL, answers }) };
  };
  try {
    const first = await rankProjects(ontology, ontology.query({ type: 'Project' }), { fetchImpl });
    assert.equal(first.model, OPENROUTER_MODEL);
    const total = ontology.query({ type: 'Project' }).length;
    assert.equal(asked, total);
    const batches = calls;
    assert.equal(batches, Math.ceil(total / 8));
    const second = await rankProjects(ontology, ontology.query({ type: 'Project' }), { fetchImpl });
    assert.equal(second.model, OPENROUTER_MODEL);
    assert.equal(calls, batches, 'unchanged projects are served from the ModelScore cache');
    const failing = async () => ({ status: 500, ok: false, text: async () => 'boom' });
    const changed = ontology.query({ type: 'Project' })[0];
    ontology.write({ ...changed, one_liner: `${changed.one_liner || ''} (edited)` });
    const third = await rankProjects(ontology, ontology.query({ type: 'Project' }), { fetchImpl: failing });
    assert.equal(third.model, 'stub');
    assert.match(third.model_error, /OpenRouter 500/);
  } finally {
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('rankBoard scores through systemone, caches a success, and retries a stub', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const db = path.join(os.tmpdir(), `via-cache-${Date.now()}.sqlite`);
  const ontology = openOntology(db);
  const doc = readSeedDocument().slice(0, 1);
  await seedOntology(ontology, doc);
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.equal(url, OPENROUTER_URL);
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'microsoft/microsoft-decision-1');
    assert.equal(Array.isArray(body.questions), false);
    assert.equal(typeof body.questions, 'object');
    assert.ok(body.questions && !Array.isArray(body.questions));
    const answers = {};
    for (const id of Object.keys(body.questions || {})) answers[id] = { type: 'score', score: 0.8 };
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ model: 'microsoft/microsoft-decision-1', answers }),
    };
  };
  const errDb = path.join(os.tmpdir(), `via-cache-err-${Date.now()}.sqlite`);
  try {
    const missing = await rankBoard(ontology, { fetchImpl });
    assert.equal(missing.model, 'stub');
    assert.equal(calls, 0);

    process.env.OPENROUTER_API_KEY = 'test-key-not-real';
    const first = await rankBoard(ontology, { fetchImpl });
    assert.equal(first.model, 'microsoft/microsoft-decision-1');
    assert.equal(first.model_error, null);
    assert.equal(calls, 1);
    const second = await rankBoard(ontology, { fetchImpl });
    assert.equal(second.rows[0].project.id, first.rows[0].project.id);
    assert.equal(second.model_error, null);
    assert.equal(calls, 1);

    const broken = openOntology(errDb);
    await seedOntology(broken, doc);
    let fails = 0;
    const failed = await rankBoard(broken, {
      fetchImpl: async () => {
        fails += 1;
        throw new Error('systemone down');
      },
    });
    assert.equal(failed.model, 'stub');
    assert.match(failed.model_error || '', /systemone down/);
    const recovered = await rankBoard(broken, {
      fetchImpl: async () => {
        fails += 1;
        return fetchImpl(OPENROUTER_URL, {
          body: JSON.stringify({
            model: 'microsoft/microsoft-decision-1',
            questions: Object.fromEntries(broken.query({ type: 'Project' }).map((row) => [row.id, { type: 'score' }])),
          }),
        });
      },
    });
    assert.equal(fails, 2);
    assert.equal(recovered.model, 'microsoft/microsoft-decision-1');
    assert.equal(recovered.model_error, null);
    const held = await rankBoard(broken, {
      fetchImpl: async () => {
        fails += 1;
        throw new Error('systemone down');
      },
    });
    assert.equal(held.model, 'microsoft/microsoft-decision-1');
    assert.equal(fails, 2);
    broken.close();
  } finally {
    ontology.close();
    fs.rmSync(db, { force: true });
    fs.rmSync(errDb, { force: true });
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('loadEnv does not clobber an already-set OPENROUTER_API_KEY', () => {
  const previous = process.env.OPENROUTER_API_KEY;
  const file = path.join(os.tmpdir(), `via-env-${Date.now()}.env`);
  fs.writeFileSync(file, 'OPENROUTER_API_KEY=\nOTHER_VIA_TEST=from-file\n');
  const previousOther = process.env.OTHER_VIA_TEST;
  try {
    process.env.OPENROUTER_API_KEY = 'already-set';
    delete process.env.OTHER_VIA_TEST;
    loadEnv(file);
    assert.equal(process.env.OPENROUTER_API_KEY, 'already-set');
    assert.equal(process.env.OTHER_VIA_TEST, 'from-file');
    delete process.env.OPENROUTER_API_KEY;
    loadEnv(file);
    assert.equal(process.env.OPENROUTER_API_KEY, undefined);
  } finally {
    fs.rmSync(file, { force: true });
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    if (previousOther == null) delete process.env.OTHER_VIA_TEST;
    else process.env.OTHER_VIA_TEST = previousOther;
  }
});

test('decide does not POST when questions is not a record', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  let calls = 0;
  try {
    const decision = await decide({
      state: { ok: true },
      questions: [{ type: 'score', instructions: 'no', criteria: ['a'] }],
      fetchImpl: async () => {
        calls += 1;
        throw new Error('network');
      },
    });
    assert.equal(calls, 0);
    assert.equal(decision.model, 'stub');
    assert.match(decision.error || '', /questions must be a record/);
  } finally {
    if (previous == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('GET /api/board includes model_error and retries a stub snapshot', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousDb = process.env.VIA_DB_PATH;
  const db = path.join(os.tmpdir(), `via-api-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  process.env.VIA_DB_PATH = db;
  delete process.env.OPENROUTER_API_KEY;
  const seeded = openOntology(db);
  await seedOntology(seeded, readSeedDocument().slice(0, 1));
  seeded.close();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let mode = 'fail';
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.equal(url, OPENROUTER_URL);
    const body = JSON.parse(init.body);
    assert.equal(body.model, OPENROUTER_MODEL);
    assert.equal(Array.isArray(body.questions), false);
    assert.equal(typeof body.questions, 'object');
    assert.ok(Object.keys(body.questions).length > 0);
    assert.ok(Object.keys(body.questions).length <= 8);
    if (mode === 'fail') throw new Error('systemone down');
    const answers = {};
    for (const id of Object.keys(body.questions)) answers[id] = { type: 'score', score: 0.8 };
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ model: 'microsoft/microsoft-decision-1', answers }),
    };
  };
  try {
    const first = await getBoard();
    assert.equal(first.model, 'stub');
    assert.equal(calls, 0);
    assert.equal(first.model_error, 'no OPENROUTER_API_KEY');

    process.env.OPENROUTER_API_KEY = 'test-key-not-real';
    const failed = await getBoard();
    assert.equal(failed.model, 'stub');
    assert.match(failed.model_error || '', /systemone down/);
    const failedCalls = calls;
    assert.equal(failedCalls, 1);

    const retried = await getBoard();
    assert.equal(retried.model, 'stub');
    assert.ok(calls > failedCalls);

    mode = 'ok';
    const scored = await getBoard();
    assert.equal(scored.model, 'microsoft/microsoft-decision-1');
    assert.equal(scored.model_error, null);
    const scoredCalls = calls;
    const cached = await getBoard();
    assert.equal(cached.model, 'microsoft/microsoft-decision-1');
    assert.equal(cached.model_error, null);
    assert.equal(calls, scoredCalls);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousDb == null) delete process.env.VIA_DB_PATH;
    else process.env.VIA_DB_PATH = previousDb;
    fs.rmSync(db, { force: true });
    fs.rmSync(`${db}-wal`, { force: true });
    fs.rmSync(`${db}-shm`, { force: true });
  }
});

function getBoard() {
  let status = 0;
  let body = '';
  const res = {
    writeHead(code) { status = code; },
    end(payload) { body = payload; },
  };
  return handle({ method: 'GET', url: '/api/board', headers: { host: '127.0.0.1' } }, res).then(() => {
    assert.equal(status, 200);
    return JSON.parse(body);
  });
}
