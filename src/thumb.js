import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { APE_FAMILY, UI_FAMILY, resolveApestronPath } from './discord/render.js';
import { rootDir, publicUrl } from './paths.js';
import { caps, slug } from './slug.js';

export const THUMB_W = 1080;
export const THUMB_H = 1350; // 4:5 Instagram portrait

export function thumbsDir() {
  return path.join(rootDir, 'public', 'thumbs');
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
  return path.join(thumbsDir(), thumbFileName(projectIdOrTitle));
}

/**
 * Render a cyberpunk share card → public/thumbs/<slug>.png.
 * Returns { image_path, thumbnail_url } always set.
 */
export async function generateProjectThumb(project, { builders = [], origin = publicUrl() } = {}) {
  fs.mkdirSync(thumbsDir(), { recursive: true });
  const id = project.id || `prj_${slug(project.title || 'untitled')}`;
  const file = thumbDiskPath(id);
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

function buildThumbSvg(project, builders) {
  const title = escapeXml(caps(project.title || 'untitled'));
  const hackathon = escapeXml(caps(project.hackathon || 'hackathon'));
  const rawLiner = String(project.one_liner || '');
  const liner = escapeXml(rawLiner.length > 90 ? `${rawLiner.slice(0, 87)}…` : rawLiner);
  const names = builders
    .map((b) => (typeof b === 'string' ? b : b?.display_name))
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ');
  const buildersLine = escapeXml(names || 'builders null');
  const fontCss = embedDisplayFontCss();

  // Wrap title into ~2 lines for long names
  const titleLines = wrapCaps(project.title || 'untitled', 14);
  const titleSvg = titleLines
    .map((line, i) => `<text x="72" y="${300 + i * 108}" class="title">${escapeXml(caps(line))}</text>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_W}" height="${THUMB_H}" viewBox="0 0 ${THUMB_W} ${THUMB_H}">
  <defs>
    <style>
      ${fontCss}
      .field { fill: #080808; }
      .dot { fill: #1a1a1a; }
      .acid { fill: #7cff77; }
      .ink { fill: #080808; }
      .muted { fill: #8a8a8a; }
      .accent { fill: #ff5a1f; }
      .kicker { font-family: "${APE_FAMILY}"; font-size: 28px; font-weight: 400; letter-spacing: 0.08em; fill: #8a8a8a; }
      .title { font-family: "${APE_FAMILY}"; font-size: 92px; font-weight: 400; letter-spacing: 0.01em; fill: #f4f4f4; }
      .liner { font-family: "${UI_FAMILY}", sans-serif; font-size: 30px; font-weight: 400; fill: #8a8a8a; }
      .builders { font-family: "${UI_FAMILY}", sans-serif; font-size: 30px; font-weight: 400; fill: #d8d8d8; }
      .meta { font-family: "${UI_FAMILY}", sans-serif; font-size: 24px; font-weight: 400; letter-spacing: 0.08em; fill: #8a8a8a; }
      .mark { font-family: "${APE_FAMILY}"; font-size: 36px; font-weight: 400; letter-spacing: 0.12em; fill: #ff5a1f; }
    </style>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle class="dot" cx="1" cy="1" r="1.2"/>
    </pattern>
  </defs>
  <rect class="field" width="100%" height="100%"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <text x="72" y="140" class="kicker">${hackathon}</text>
  <rect class="acid" x="72" y="168" width="48" height="2"/>
  ${titleSvg}
  <text x="72" y="${300 + titleLines.length * 108 + 36}" class="liner">${liner || ''}</text>
  <text x="72" y="${THUMB_H - 200}" class="meta">BUILDERS</text>
  <text x="72" y="${THUMB_H - 150}" class="builders">${buildersLine}</text>
  <text x="72" y="${THUMB_H - 72}" class="mark">VIA</text>
</svg>`;
}

function embedDisplayFontCss() {
  const ape = resolveApestronPath();
  if (!ape || !fs.existsSync(ape)) return '';
  const b64 = fs.readFileSync(ape).toString('base64');
  return `@font-face { font-family: "${APE_FAMILY}"; src: url("data:font/otf;base64,${b64}") format("opentype"); font-weight: 400; font-style: normal; }`;
}

function wrapCaps(title, maxChars) {
  const words = caps(title).split(/\s+/).filter(Boolean);
  if (!words.length) return ['UNTITLED'];
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
