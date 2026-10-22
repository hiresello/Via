import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasOpenRouterKey } from '../decision.js';
import { loadEnv } from '../env.js';
import { dbPath, publicUrl, rootDir } from '../paths.js';
import { openOntology } from '../ontology.js';
import { seedOntology } from '../seed.js';
import { likeProject, presentBoard, rankBoard, saveProfile, submitProject, ensurePerson } from '../service.js';
import { thumbDiskPath, thumbFileName, thumbRelPath } from '../thumb.js';
import { renderBoard, renderBuilders, renderMe, renderNew, renderPrivacy, renderProject, renderTerms } from './html.js';

loadEnv(path.join(rootDir, '.env'));

let ontology;
let seeding;

export async function getOntology() {
  if (!ontology) {
    ontology = openOntology(dbPath());
  }
  if (!seeding) {
    seeding = (async () => {
      const projects = ontology.query({ type: 'Project' });
      if (!projects.length) await seedOntology(ontology);
    })();
  }
  await seeding;
  return ontology;
}

let boardRank = null;

export async function bootBoard() {
  loadEnv(path.join(rootDir, '.env'));
  const ont = await getOntology();
  if (!ont.query({ type: 'Project' }).length) return presentBoard(ont);
  if (!boardRank) {
    boardRank = rankBoard(ont, { forceStub: !hasOpenRouterKey() }).finally(() => {
      boardRank = null;
    });
  }
  await boardRank;
  return presentBoard(ont);
}

export async function handle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const origin = requestOrigin(req);
  try {
    if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
      return sendFont(url.pathname, res);
    }
    if (req.method === 'GET' && (url.pathname === '/via-ui.css' || url.pathname === '/docs/via-ui.css')) {
      return sendCss(res);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/thumbs/')) {
      return sendThumb(url.pathname, res);
    }
    if (req.method === 'GET' && (url.pathname === '/via-discord-icon-512.png' || url.pathname === '/favicon.ico')) {
      return sendLogo(res);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/og/') && url.pathname.endsWith('.png')) {
      const id = decodeURIComponent(url.pathname.slice(4, -4));
      const projectId = id.startsWith('prj_') ? id : `prj_${id}`;
      return redirect(res, thumbRelPath(projectId));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/leaderboard')) {
      await bootBoard();
      return html(res, renderBoard(presentBoard(await getOntology()), { origin }));
    }
    if (req.method === 'GET' && url.pathname === '/builders') {
      await bootBoard();
      return html(res, renderBuilders(presentBoard(await getOntology())));
    }
    if (req.method === 'GET' && url.pathname === '/p/new') {
      return html(res, renderNew((await getOntology()).query({ type: 'Event' })));
    }
    if (req.method === 'POST' && url.pathname === '/p/new') {
      const body = await readBody(req);
      try {
        await submitProject(await getOntology(), body, { forceStub: !hasOpenRouterKey() });
        return redirect(res, '/');
      } catch (error) {
        return html(res, renderNew((await getOntology()).query({ type: 'Event' }), error.message), 400);
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
      const id = decodeURIComponent(url.pathname.slice(3));
      if (id === 'new') return html(res, renderNew((await getOntology()).query({ type: 'Event' })));
      await bootBoard();
      const board = presentBoard(await getOntology());
      const row = board.rows.find((item) => item.project.id === id || item.project.id === `prj_${id}`);
      if (!row) return text(res, 'Project not found', 404);
      return html(res, renderProject(row, { origin }));
    }
    if (req.method === 'GET' && url.pathname === '/me') {
      const id = url.searchParams.get('id');
      const person = id
        ? (await getOntology()).query({ type: 'Person' }).find((row) => row.id === id)
        : null;
      return html(res, renderMe(person));
    }
    if (req.method === 'POST' && url.pathname === '/me') {
      const body = await readBody(req);
      try {
        const person = saveProfile(await getOntology(), body);
        res.setHeader('Set-Cookie', `via_name=${encodeURIComponent(person.display_name)}; Path=/; SameSite=Lax`);
        return redirect(res, `/?me=${encodeURIComponent(person.id)}`);
      } catch (error) {
        return html(res, renderMe(null, error.message), 400);
      }
    }
    if (req.method === 'POST' && url.pathname === '/like') {
      const body = await readBody(req);
      const displayName = body.display_name || readCookie(req, 'via_name');
      if (!displayName) return redirect(res, '/me');
      const person = ensurePerson(await getOntology(), { displayName });
      await likeProject(await getOntology(), {
        userId: person.id,
        projectId: body.project_id,
        signal: body.signal || 'like',
      }, { forceStub: !hasOpenRouterKey() });
      return redirect(res, '/');
    }
    if (req.method === 'GET' && url.pathname === '/api/board') {
      await bootBoard();
      const board = presentBoard(await getOntology());
      return json(res, {
        model: board.model,
        chosen_by: board.chosen_by,
        model_error: board.model_error ?? null,
        rows: board.rows.map((row) => ({
          rank: row.rank,
          score: row.score,
          reason: row.reason,
          likes: row.likes,
          capped: row.capped,
          title: row.project.title,
          hackathon: row.project.hackathon,
          thumbnail_url: row.project.thumbnail_url || null,
          image_path: row.project.image_path || null,
        })),
      });
    }
    if (req.method === 'GET' && url.pathname === '/terms') {
      return html(res, renderTerms());
    }
    if (req.method === 'GET' && url.pathname === '/privacy') {
      return html(res, renderPrivacy());
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, { ok: true });
    }
    return text(res, 'Not found', 404);
  } catch (error) {
    return text(res, error.message, 500);
  }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

function requestOrigin(req) {
  if (process.env.VIA_PUBLIC_URL) return publicUrl();
  const host = req.headers.host;
  if (!host) return publicUrl();
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`.replace(/\/$/, '');
}

const FONT_ALLOW = new Set([
  'Apestron.otf',
  'Apestron.ttf',
  'InstrumentSans-latin-400-normal.woff2',
  'Syne-latin-400-normal.woff2',
  'Syne-latin-700-normal.woff2',
  'SpaceGrotesk-latin-400-normal.woff2',
  'SpaceGrotesk-latin-500-normal.woff2',
  'SpaceGrotesk-latin-700-normal.woff2',
]);

function sendFont(pathname, res) {
  const name = path.basename(pathname);
  if (!FONT_ALLOW.has(name)) return text(res, 'Not found', 404);
  let file = path.join(rootDir, 'fonts', name);
  if ((name === 'Apestron.otf' || name === 'Apestron.ttf') && !fs.existsSync(file)) {
    const envPath = process.env.VIA_DISPLAY_FONT && String(process.env.VIA_DISPLAY_FONT).trim();
    if (envPath && fs.existsSync(envPath)) file = path.resolve(envPath);
  }
  if (!fs.existsSync(file)) return text(res, 'Font not shipped yet', 404);
  const type = name.endsWith('.woff2')
    ? 'font/woff2'
    : name.endsWith('.ttf')
      ? 'font/ttf'
      : 'font/otf';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

function sendLogo(res) {
  const file = path.join(rootDir, 'public', 'via-discord-icon-512.png');
  if (!fs.existsSync(file)) return text(res, 'Logo missing', 404);
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

function sendThumb(pathname, res) {
  const name = path.basename(pathname);
  if (!/^[a-z0-9-]+\.png$/i.test(name)) return text(res, 'Not found', 404);
  const file = path.join(rootDir, 'public', 'thumbs', name);
  if (!fs.existsSync(file)) {
    // Try resolving from project id slug
    const alt = thumbDiskPath(`prj_${name.replace(/\.png$/i, '')}`);
    if (!fs.existsSync(alt)) return text(res, 'Thumb missing', 404);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
    return fs.createReadStream(alt).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
}

function sendCss(res) {
  const file = path.join(rootDir, 'public', 'via-ui.css');
  if (!fs.existsSync(file)) return text(res, 'via-ui.css missing', 404);
  res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
}

function html(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function json(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function text(res, body, status) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(Object.fromEntries(new URLSearchParams(raw)));
    });
    req.on('error', reject);
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && !process.env.VERCEL) {
  const port = Number(process.env.PORT || 8787);
  await bootBoard();
  http.createServer((req, res) => { handle(req, res); }).listen(port, () => {
    console.log(`Via leaderboard http://127.0.0.1:${port}/`);
  });
}

export const config = { maxDuration: 60 };

export default function vercelHandler(req, res) {
  return handle(req, res);
}
