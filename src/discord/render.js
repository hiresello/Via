import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rootDir } from '../paths.js';
import { caps } from '../slug.js';

const ACID = '#7cff77';
const INK = '#111111';

/** Family name inside Apestron.otf. Weight 400 only — never synthesize bold. */
export const APE_FAMILY = 'Apestron Trial Version';
export const UI_FAMILY = 'Instrument Sans';

/**
 * Resolve the optional Juan look (Apestron trial — not shipped in the MIT tree).
 * Order: VIA_DISPLAY_FONT env path → fonts/Apestron.otf → fonts/Apestron.ttf.
 */
export function resolveApestronPath() {
  const fromEnv = process.env.VIA_DISPLAY_FONT && String(process.env.VIA_DISPLAY_FONT).trim();
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);
  const storeApe = '/cursor/stores/self/media/fonts/Apestron.otf';
  if (fs.existsSync(storeApe)) return storeApe;
  const dir = path.join(rootDir, 'fonts');
  for (const name of ['Apestron.otf', 'Apestron.ttf']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function fontFiles() {
  const dir = path.join(rootDir, 'fonts');
  const apestron = resolveApestronPath();
  const syne700 = path.join(dir, 'Syne-latin-700-normal.woff2');
  const syne400 = path.join(dir, 'Syne-latin-400-normal.woff2');
  const space400 = path.join(dir, 'SpaceGrotesk-latin-400-normal.woff2');
  const space500 = path.join(dir, 'SpaceGrotesk-latin-500-normal.woff2');
  const space700 = path.join(dir, 'SpaceGrotesk-latin-700-normal.woff2');
  return {
    apestron,
    displayName: apestron ? 'Apestron' : 'Syne',
    syne700: fs.existsSync(syne700) ? syne700 : null,
    syne400: fs.existsSync(syne400) ? syne400 : null,
    space400: fs.existsSync(space400) ? space400 : null,
    space500: fs.existsSync(space500) ? space500 : null,
    space700: fs.existsSync(space700) ? space700 : null,
  };
}

/** Public URL basename for a local Apestron file, or null. */
export function apestronPublicName(filePath = resolveApestronPath()) {
  if (!filePath) return null;
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith('.otf')) return 'Apestron.otf';
  if (base.endsWith('.ttf')) return 'Apestron.ttf';
  return null;
}

/**
 * CSS @font-face block.
 * Apestron when the trial file is present locally (or VIA_DISPLAY_FONT).
 * OFL Syne + Space Grotesk always available for clones.
 */
export function displayFontFace(urlPrefix = '/fonts/') {
  return [
    `@font-face { font-family: "${APE_FAMILY}"; src: url("${urlPrefix}Apestron.otf") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }`,
    `@font-face { font-family: "${UI_FAMILY}"; src: url("${urlPrefix}InstrumentSans-latin-400-normal.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }`,
  ].join('\n');
}

/** Display is Apestron Trial Version at 400. Body is Instrument Sans. No Syne, no bold synthesis. */
export function displayStackCss() {
  return `:root { --via-font-display: "${APE_FAMILY}"; --via-font-ui: "${UI_FAMILY}"; --via-font-mono: "${UI_FAMILY}"; }
html { font-synthesis: none; }
.via-display, .via-rank, .via-nav__brand { font-family: "${APE_FAMILY}"; font-weight: 400; font-style: normal; font-synthesis: none; }`;
}

export function cardHtml(row) {
  const project = row.project;
  const builders = row.builders.map((person) => person.display_name).filter(Boolean).join(' · ') || 'null';
  const organizers = (row.organizers || []).map((org) => org.name).filter(Boolean).join(' · ') || 'null';
  return pageHtml({
    width: 1200,
    height: 680,
    ground: ACID,
    ink: INK,
    kicker: caps(`#${String(row.rank).padStart(2, '0')} · ${project.hackathon || 'null'}`),
    title: caps(project.title || 'untitled'),
    body: [
      project.one_liner || 'null',
      '',
      `BUILDERS  ${builders}`,
      `ORGANIZERS  ${organizers}`,
      row.reason || '',
    ].filter(Boolean).join('\n'),
  });
}

export function bannerHtml() {
  return pageHtml({
    width: 1200,
    height: 360,
    ground: ACID,
    ink: INK,
    kicker: caps('public bar'),
    title: caps('Via'),
    body: caps('Who pushed. Under the clock.'),
  });
}

export function pageHtml({ width, height, ground, ink, kicker, title, body }) {
  const fonts = fontFiles();
  const faces = [];
  if (fonts.apestron) {
    const format = fonts.apestron.toLowerCase().endsWith('.ttf') ? 'truetype' : 'opentype';
    faces.push(`@font-face { font-family: "Apestron"; src: url("file://${fonts.apestron}") format("${format}"); font-weight: 400 700; font-style: normal; }`);
  }
  if (fonts.syne700) {
    faces.push(`@font-face { font-family: "Syne"; src: url("file://${fonts.syne700}") format("woff2"); font-weight: 700; font-style: normal; }`);
  }
  if (fonts.space400) {
    faces.push(`@font-face { font-family: "Space Grotesk"; src: url("file://${fonts.space400}") format("woff2"); font-weight: 400; font-style: normal; }`);
  }
  const display = fonts.apestron
    ? '"Apestron", "Syne", "Arial Narrow", sans-serif'
    : '"Syne", "Arial Narrow", sans-serif';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${faces.join('\n')}
  html, body { margin: 0; width: ${width}px; height: ${height}px; background: ${ground}; color: ${ink}; }
  body { box-sizing: border-box; padding: 48px 56px; font-family: ${display}; }
  .kicker { font-size: 22px; letter-spacing: 0.08em; font-weight: 700; text-transform: uppercase; }
  h1 { font-size: 92px; line-height: 0.86; font-weight: 700; margin: 18px 0; letter-spacing: -0.03em; text-transform: uppercase; }
  p { white-space: pre-wrap; font-family: "Space Grotesk", ui-sans-serif, sans-serif; font-size: 18px; line-height: 1.45; max-width: 980px; }
</style>
</head>
<body>
  <div class="kicker">${escapeHtml(kicker)}</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
</body>
</html>`;
}

export async function renderHtmlToPng(html, { width = 1200, height = 680 } = {}) {
  const chrome = process.env.CHROME_PATH || 'google-chrome';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-card-'));
  const htmlPath = path.join(dir, 'card.html');
  const pngPath = path.join(dir, 'card.png');
  fs.writeFileSync(htmlPath, html);
  await new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))));
  });
  const buffer = fs.readFileSync(pngPath);
  fs.rmSync(dir, { recursive: true, force: true });
  return buffer;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
