import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { rootDir } from './paths.js';
import { resolveApestronPath } from './discord/render.js';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

/** Apestron Trial ships "NO GLYPH" boxes for odd digits; digits come from Space Grotesk. */
const DIGIT = /[0-9]/;

let cache = null;
function fonts() {
  if (cache) return cache;
  const fontsDir = path.join(rootDir, 'fonts');
  const ape = resolveApestronPath();
  cache = {
    display: ape ? opentype.loadSync(ape) : opentype.loadSync(path.join(fontsDir, 'SpaceGrotesk-latin-500-normal.ttf')),
    digits: opentype.loadSync(path.join(fontsDir, 'SpaceGrotesk-latin-500-normal.ttf')),
    ui: opentype.loadSync(path.join(fontsDir, 'InstrumentSans-latin-400-normal.ttf')),
  };
  return cache;
}

function runs(text, kind) {
  const f = fonts();
  if (kind !== 'display') return [{ font: f.ui, text }];
  const out = [];
  for (const ch of String(text)) {
    const font = DIGIT.test(ch) ? f.digits : f.display;
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ font, text: ch });
  }
  return out;
}

/** Advance width of `text` at `size` px with `tracking` em letter-spacing. */
export function measure(text, { kind = 'ui', size = 16, tracking = 0 } = {}) {
  let width = 0;
  let count = 0;
  for (const run of runs(text, kind)) {
    width += run.font.getAdvanceWidth(run.text, size, { kerning: true });
    count += [...run.text].length;
  }
  return width + Math.max(0, count - 1) * tracking * size;
}

/** SVG path data for `text` with its baseline at (x, y). */
export function pathData(text, { kind = 'ui', size = 16, tracking = 0, x = 0, y = 0 } = {}) {
  let cursor = x;
  const parts = [];
  for (const run of runs(text, kind)) {
    for (const ch of run.text) {
      const p = run.font.getPath(ch, cursor, y, size, { kerning: false });
      parts.push(p.toPathData(2));
      cursor += run.font.getAdvanceWidth(ch, size) + tracking * size;
    }
  }
  return parts.filter(Boolean).join('');
}

/** Greedy word wrap to `maxWidth`. Long single words are kept whole. */
export function wrap(text, maxWidth, opts) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, opts) > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Clamp to `maxLines`, ending the last line with an ellipsis that fits. */
export function clampLines(lines, maxLines, maxWidth, opts) {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]}…`;
  while (last.length > 1 && measure(last, opts) > maxWidth) last = `${last.slice(0, -2).trimEnd()}…`;
  kept[maxLines - 1] = last;
  return kept;
}

export function writeIfChanged(file, data) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (prev && Buffer.compare(prev, Buffer.from(data)) === 0) return false;
  fs.writeFileSync(file, data);
  return true;
}
