#!/usr/bin/env node
/**
 * Fetch one real image per seed project → public/shots/<project-slug>.jpg.
 * Order: live demo screenshot (headless Chrome), first README image, page og:image.
 * Projects with none keep the generated title card.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { rootDir } from '../src/paths.js';
import { projectIdForSeedRow, readSeedDocument } from '../src/seed.js';
import { shotFileName, SHOT_W, SHOT_H } from '../src/thumb.js';

const dir = path.join(rootDir, 'public', 'shots');
fs.mkdirSync(dir, { recursive: true });
const noDemo = process.argv.includes('--no-demo');
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const chrome = process.env.CHROME_PATH || 'google-chrome';

async function save(buf, file) {
  const meta = await sharp(buf).metadata();
  if (!meta.width || meta.width < 300 || meta.height < 200) throw new Error('image too small');
  const stats = await sharp(buf).stats();
  if (stats.channels.every((c) => c.stdev < 6)) throw new Error('blank image');
  await sharp(buf).resize(SHOT_W, SHOT_H, { fit: 'cover', position: 'top' }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
}

function screenshot(url) {
  const tmp = path.join(os.tmpdir(), `shot-${Date.now()}.png`);
  const run = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=8000', '--window-size=1080,1350', `--screenshot=${tmp}`, url], { timeout: 45000 });
  if (!fs.existsSync(tmp)) throw new Error(`chrome failed (${run.status})`);
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buf;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'via-shots' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

async function readmeImage(repoUrl) {
  const m = /github\.com\/([^/]+)\/([^/#?]+)/.exec(repoUrl || '');
  if (!m) throw new Error('not a GitHub repo');
  const [owner, repo] = [m[1], m[2].replace(/\.git$/, '')];
  const meta = JSON.parse(execFileSync('gh', ['api', `repos/${owner}/${repo}`], { encoding: 'utf8' }));
  const readme = execFileSync('gh', ['api', `repos/${owner}/${repo}/readme`, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8' });
  const refs = [...readme.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)["']/gi)].map((r) => r[1] || r[2]);
  for (const ref of refs) {
    if (/badge|shields\.io|\.svg(\?|$)|github\.com\/[^/]+\/[^/]+\/workflows/i.test(ref)) continue;
    const url = /^https?:/.test(ref)
      ? ref.replace(/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'raw.githubusercontent.com/$1/$2/')
      : `https://raw.githubusercontent.com/${owner}/${repo}/${meta.default_branch}/${ref.replace(/^\.?\//, '')}`;
    try {
      return Buffer.from(await (await get(url)).arrayBuffer());
    } catch {}
  }
  throw new Error('no README image');
}

async function ogImage(pageUrl) {
  const html = await (await get(pageUrl)).text();
  const m = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)
    || /content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image/i.exec(html);
  if (!m) throw new Error('no og:image');
  return Buffer.from(await (await get(m[1].replace(/&amp;/g, '&'))).arrayBuffer());
}

const taken = new Set();
for (const row of readSeedDocument()) {
  const id = projectIdForSeedRow(row, taken);
  if (only.length && !only.includes(id)) continue;
  const file = path.join(dir, shotFileName(id));
  const tries = [
    row.demo_url && !noDemo && (() => screenshot(row.demo_url)),
    row.repo_url && (() => readmeImage(row.repo_url)),
    row.source_url && (() => ogImage(row.source_url)),
  ].filter(Boolean);
  let done = '';
  for (const attempt of tries) {
    try {
      await save(await attempt(), file);
      done = 'ok';
      break;
    } catch (error) {
      done = error.message;
    }
  }
  console.log(`${done === 'ok' ? 'ok  ' : 'none'} ${id}${done === 'ok' ? '' : ` (${done || 'no links'})`}`);
}
