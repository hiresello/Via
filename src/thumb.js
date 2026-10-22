import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { rootDir, publicUrl } from './paths.js';
import { caps, slug } from './slug.js';
import { clampLines, measure, pathData, wrap } from './type.js';

export const THUMB_W = 1080;
export const THUMB_H = 1350; // 4:5 Instagram portrait
/** Real project image (demo screenshot / README image) on the top of the card. */
export const SHOT_W = 1080;
export const SHOT_H = 720;

export function shotFileName(projectIdOrTitle) {
  return thumbFileName(projectIdOrTitle).replace(/\.png$/, '.jpg');
}

function shotUri(project) {
  const id = project.id || `prj_${slug(project.title || 'untitled')}`;
  const file = path.join(rootDir, 'public', 'shots', shotFileName(id));
  return fs.existsSync(file) ? `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}` : '';
}

export function thumbsDir() {
  return path.join(rootDir, 'public', 'thumbs');
}

/** Committed thumbs are read-only on Vercel; new submissions render to /tmp there. */
export function writableThumbsDir() {
  if (process.env.VIA_THUMBS_DIR) return process.env.VIA_THUMBS_DIR;
  if (process.env.VERCEL) return '/tmp/via-thumbs';
  return thumbsDir();
}

export function thumbFileName(projectIdOrTitle) {
  const raw = String(projectIdOrTitle || 'untitled');
  const base = raw.startsWith('prj_') ? raw.slice(4) : slug(raw);
  return `${base || 'untitled'}.png`;
}

export function thumbRelPath(projectIdOrTitle) {
  return `/thumbs/${thumbFileName(projectIdOrTitle)}`;
}

export function thumbAbsoluteUrl(projectIdOrTitle, origin = publicUrl()) {
  return `${String(origin).replace(/\/$/, '')}${thumbRelPath(projectIdOrTitle)}`;
}

export function thumbDiskPath(projectIdOrTitle) {
  const name = thumbFileName(projectIdOrTitle);
  const committed = path.join(thumbsDir(), name);
  if (fs.existsSync(committed)) return committed;
  return path.join(writableThumbsDir(), name);
}

/**
 * Render a cyberpunk share card → public/thumbs/<slug>.png.
 * Returns { image_path, thumbnail_url } always set.
 */
export async function generateProjectThumb(project, { builders = [], origin = publicUrl() } = {}) {
  const id = project.id || `prj_${slug(project.title || 'untitled')}`;
  fs.mkdirSync(writableThumbsDir(), { recursive: true });
  const file = path.join(writableThumbsDir(), thumbFileName(id));
  const svg = buildThumbSvg(project, builders);
  await sharp(Buffer.from(svg)).png().toFile(file);
  const image_path = `public/thumbs/${thumbFileName(id)}`;
  const thumbnail_url = thumbAbsoluteUrl(id, origin);
  return { image_path, thumbnail_url, file };
}

/** Ensure a PNG exists on disk; generate if missing. */
export async function ensureProjectThumb(project, builders = []) {
  const id = project.id;
  const file = thumbDiskPath(id);
  if (!fs.existsSync(file)) {
    return generateProjectThumb(project, { builders });
  }
  return {
    image_path: project.image_path || `public/thumbs/${thumbFileName(id)}`,
    thumbnail_url: project.thumbnail_url || thumbAbsoluteUrl(id),
    file,
  };
}

const PAD = 72;
const TEXT_W = THUMB_W - PAD * 2;

let logoDataUri = null;
function logoUri() {
  if (logoDataUri) return logoDataUri;
  const file = path.join(rootDir, 'public', 'via-discord-icon-512.png');
  logoDataUri = fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : '';
  return logoDataUri;
}

/** All text is outlined to paths so the card never depends on system fonts. */
export function buildThumbSvg(project, builders = []) {
  const title = caps(project.title || 'untitled');
  const hackathon = caps(project.hackathon || '');
  const names = builders
    .map((b) => (typeof b === 'string' ? b : b?.display_name))
    .filter(Boolean)
    .join(' · ');

  const shot = shotUri(project);
  const maxTitle = shot ? 2 : 3;
  let size = shot ? 104 : 132;
  let titleLines;
  const titleOpts = () => ({ kind: 'display', size, tracking: 0.01 });
  for (;;) {
    titleLines = wrap(title, TEXT_W, titleOpts());
    const widest = Math.max(...titleLines.map((line) => measure(line, titleOpts())));
    if ((titleLines.length <= maxTitle && widest <= TEXT_W) || size <= 64) break;
    size -= 6;
  }
  titleLines = clampLines(titleLines, maxTitle, TEXT_W, titleOpts());
  const lineH = Math.round(size * 1.04);

  const linerOpts = { kind: 'ui', size: 38 };
  const linerLines = clampLines(wrap(project.one_liner || '', TEXT_W, linerOpts), shot ? 2 : 4, TEXT_W, linerOpts);
  const nameOpts = { kind: 'ui', size: 32 };
  const nameW = TEXT_W - 150;
  const nameLines = clampLines(wrap(names, nameW, nameOpts), 2, nameW, nameOpts);
  const kickOpts = { kind: 'ui', size: 26, tracking: 0.1 };
  const kickW = THUMB_W - PAD * 2 - 340;
  const kicker = clampLines(wrap(hackathon, kickW, kickOpts), 2, kickW, kickOpts);

  const titleTop = shot ? SHOT_H + 24 : 430;
  const parts = [];
  titleLines.forEach((line, i) => parts.push(`<path fill="#f4f4f4" d="${pathData(line, { ...titleOpts(), x: PAD, y: titleTop + size * 0.72 + i * lineH })}"/>`));
  const ruleY = titleTop + size * 0.72 + (titleLines.length - 1) * lineH + 48;
  parts.push(`<rect x="${PAD}" y="${ruleY}" width="96" height="6" rx="3" fill="#ff5a1f"/>`);
  linerLines.forEach((line, i) => parts.push(`<path fill="#b8b8b8" d="${pathData(line, { ...linerOpts, x: PAD, y: ruleY + 80 + i * 52 })}"/>`));
  kicker.forEach((line, i) => {
    const w = measure(line, kickOpts);
    const y = shot ? SHOT_H - 40 - (kicker.length - 1 - i) * 38 : 128 + i * 38;
    parts.push(`<path fill="${shot ? '#f4f4f4' : '#8a8a8a'}" d="${pathData(line, { ...kickOpts, x: THUMB_W - PAD - w, y })}"/>`);
  });
  const builderTop = THUMB_H - PAD - (nameLines.length - 1) * 44;
  if (nameLines.length) {
    parts.push(`<path fill="#ff5a1f" d="${pathData(caps('Builders'), { kind: 'ui', size: 22, tracking: 0.14, x: PAD, y: builderTop - 52 })}"/>`);
    nameLines.forEach((line, i) => parts.push(`<path fill="#e8e8e8" d="${pathData(line, { ...nameOpts, x: PAD, y: builderTop + i * 44 })}"/>`));
  }
  const logo = logoUri();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${THUMB_W}" height="${THUMB_H}" viewBox="0 0 ${THUMB_W} ${THUMB_H}">
  <defs>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#1c1c1c"/></pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#080808" stop-opacity="0"/><stop offset="1" stop-color="#080808" stop-opacity="1"/></linearGradient>
    <radialGradient id="glow" cx="1" cy="1" r="0.9"><stop offset="0" stop-color="#ff5a1f" stop-opacity="0.22"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#080808"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${shot ? `<image x="0" y="0" width="${SHOT_W}" height="${SHOT_H}" preserveAspectRatio="xMidYMin slice" href="${shot}" xlink:href="${shot}"/><rect x="0" y="0" width="${SHOT_W}" height="${SHOT_H}" fill="url(#fade)"/>` : ''}
  ${logo ? `<image x="${THUMB_W - PAD - 112}" y="${THUMB_H - PAD - 96}" width="128" height="128" href="${logo}" xlink:href="${logo}"/>` : ''}
  ${parts.join('\n  ')}
</svg>`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
