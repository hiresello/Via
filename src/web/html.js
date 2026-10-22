import { caps } from '../slug.js';
import { displayFontFace, displayStackCss } from '../discord/render.js';
import { publicUrl } from '../paths.js';
import { REASON_CRITERIA } from '../ranker.js';
import { thumbRelPath } from '../thumb.js';

const STOCK_REASONS = new Set(Object.values(REASON_CRITERIA));

function specificReason(reason) {
  const text = String(reason || '').trim();
  if (!text || STOCK_REASONS.has(text)) return '';
  if (/stranger can open one path/i.test(text)) return '';
  return text;
}

export function renderBoard(board, { origin = publicUrl() } = {}) {
  const rows = board.rows.map((row) => rowHtml(row, origin)).join('\n');
  const empty = board.rows.length
    ? ''
    : '<p class="via-empty">No projects in the seed file. The board does not invent any.</p>';
  return layout({
    title: 'Builds · Via',
    active: 'builds',
    origin,
    main: `
      <section class="via-hero via-enter">
        <h1 class="via-display">${caps('Builds')}</h1>
        <p class="via-lede">${board.rows.length} projects · ${modelLine(board)}</p>
      </section>
      <ol class="via-board">${rows}</ol>
      ${empty}`,
  });
}

export function renderBuilders(builders, board) {
  const rows = builders.map((row) => builderRowHtml(row)).join('\n');
  return layout({
    title: 'Builders · Via',
    active: 'builders',
    main: `
      <section class="via-hero via-enter">
        <h1 class="via-display">${caps('Builders')}</h1>
        <p class="via-lede">${builders.length} builders · score is the sum of their builds · ${modelLine(board)}</p>
      </section>
      <ol class="via-people">${rows}</ol>
      ${builders.length ? '' : '<p class="via-empty">No builders on the board yet.</p>'}`,
  });
}

function modelLine(board) {
  if (board.model && board.model !== 'stub') return `scored by System One · ${escapeHtml(board.model)}`;
  return 'stub scores · System One unavailable';
}

function medalClass(rank) {
  return rank === 1 ? 'is-gold' : rank === 2 ? 'is-silver' : rank === 3 ? 'is-bronze' : '';
}

function medalName(rank) {
  return rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
}

function deltaHtml(delta) {
  const n = Number(delta);
  if (delta == null || !Number.isFinite(n)) return '';
  if (n > 0) return `<span class="via-delta via-delta--up" title="Up ${n}">▲ ${n}</span>`;
  if (n < 0) return `<span class="via-delta via-delta--down" title="Down ${Math.abs(n)}">▼ ${Math.abs(n)}</span>`;
  return '<span class="via-delta via-delta--flat" title="No change">–</span>';
}

function pct(score) {
  const n = Number(score);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function scoreBar(score, likes) {
  const value = pct(score);
  return `<div class="via-points" aria-label="Score ${value}, ${likes} likes">
        <span class="via-points__n">${value}</span>
        <span class="via-bar"><span class="via-bar__fill" style="width:${value}%"></span></span>
      </div>`;
}

function rankBadge(rank, delta) {
  const medal = medalName(rank);
  return `<span class="via-rank-badge">
        <span class="via-rank">${String(rank).padStart(2, '0')}</span>
        ${medal ? `<span class="via-medal">${caps(medal)}</span>` : ''}
        ${deltaHtml(delta)}
      </span>`;
}

function likeForm(project, likes, next) {
  return `<form method="post" action="/like" class="via-like like">
          <input type="hidden" name="project_id" value="${escapeHtml(project.id)}">
          <input type="hidden" name="signal" value="like">
          <input type="hidden" name="next" value="${escapeHtml(next)}">
          <input type="hidden" name="display_name" class="like-name" value="">
          <button type="submit" class="via-btn via-btn--primary like-btn" aria-label="Like ${escapeHtml(project.title || '')}">
            <span aria-hidden="true">▲</span> ${caps('Like')} <span class="like-count">${likes}</span>
          </button>
        </form>`;
}

export function renderProject(row, { origin = publicUrl() } = {}) {
  const project = row.project;
  const thumb = projectThumbSrc(project, origin);
  const pagePath = `/p/${encodeURIComponent(project.id)}`;
  const pageUrl = `${origin}${pagePath}`;
  const builders = row.builders.map((person) => escapeHtml(person.display_name)).filter(Boolean).join(' · ');
  const reason = specificReason(row.reason);
  return layout({
    title: `${project.title || 'Project'} · Via`,
    active: 'builds',
    origin,
    meta: {
      title: caps(project.title || 'Via project'),
      description: project.one_liner || 'A build on Via.',
      image: thumb.startsWith('http') ? thumb : `${origin}${thumb}`,
      url: pageUrl,
    },
    main: `
      <article class="via-project ${medalClass(row.rank)} via-enter">
        <div class="via-thumb via-thumb--hero">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caps(project.title || 'untitled'))}" width="1080" height="1350" fetchpriority="high">
          ${rankBadge(row.rank, row.delta)}
        </div>
        <section class="via-project__body">
          <p class="via-label">${caps(`Rank ${row.rank} of the builds`)}</p>
          <h1 class="via-display via-project__title">${escapeHtml(caps(project.title || 'untitled'))}</h1>
          ${project.one_liner ? `<p class="via-liner">${escapeHtml(project.one_liner)}</p>` : ''}
          ${scoreBar(row.score, row.likes)}
          <dl class="via-facts">
            ${builders ? `<div><dt>Builders</dt><dd>${builders}</dd></div>` : ''}
            ${project.hackathon ? `<div><dt>Hackathon</dt><dd>${escapeHtml(project.hackathon)}</dd></div>` : ''}
            <div><dt>Likes</dt><dd>${row.likes}</dd></div>
            ${row.capped ? '<div><dt>Status</dt><dd>Capped · no runnable path or event clock</dd></div>' : ''}
          </dl>
          ${reason ? `<p class="via-reason">${escapeHtml(reason)}</p>` : ''}
          <div class="via-card__foot">
            ${pathButtons(project)}
            ${likeForm(project, row.likes, pagePath)}
          </div>
        </section>
      </article>
      <a class="via-back" href="/">← ${caps('Builds')}</a>`,
  });
}

export function renderNew(events, error) {
  const options = events.map((event) => `<option value="${escapeHtml(event.title)}">${escapeHtml(event.title)}</option>`).join('');
  return layout({
    title: 'Submit · Via',
    active: 'new',
    main: `
      <section class="via-hero via-hero--slim via-enter">
        <p class="via-label">${caps('submit')}</p>
        <h1 class="via-display">${caps('Post a build')}</h1>
      </section>
      <form class="via-glass via-card via-form" method="post" action="/p/new">
        ${error ? `<p class="via-error">${escapeHtml(error)}</p>` : ''}
        <div class="via-field-row"><label class="via-label">Title</label><input class="via-input" name="title" required maxlength="120"></div>
        <div class="via-field-row"><label class="via-label">One line</label><input class="via-input" name="one_liner" maxlength="280" placeholder="What a stranger can see"></div>
        <div class="via-field-row"><label class="via-label">Demo URL</label><input class="via-input" name="demo_url" type="url" placeholder="null if you have none"></div>
        <div class="via-field-row"><label class="via-label">Repo URL</label><input class="via-input" name="repo_url" type="url"></div>
        <div class="via-field-row"><label class="via-label">Source URL</label><input class="via-input" name="source_url" type="url"></div>
        <div class="via-field-row"><label class="via-label">Image URL</label><input class="via-input" name="thumbnail_url" type="url" placeholder="Optional — else Via generates a share card"></div>
        <div class="via-field-row"><label class="via-label">Hackathon</label><input class="via-input" name="hackathon" list="events"></div>
        <datalist id="events">${options}</datalist>
        <div class="via-field-row"><label class="via-label">Builders</label><input class="via-input" name="builders" placeholder="Names, comma separated"></div>
        <div class="via-field-row"><label class="via-label">Organizers</label><input class="via-input" name="organizers" placeholder="Leave blank for null"></div>
        <div class="via-actions"><button type="submit" class="via-btn via-btn--primary">${caps('Post')}</button></div>
      </form>
      <a class="via-back" href="/">← ${caps('Builds')}</a>`,
  });
}

export function renderMe(person, error, { next = '', like = '' } = {}) {
  return layout({
    title: 'Me · Via',
    active: 'me',
    main: `
      <section class="via-hero via-hero--slim via-enter">
        <p class="via-label">${caps('profile')}</p>
        <h1 class="via-display">${caps(person?.display_name || 'Your name')}</h1>
      </section>
      <form class="via-glass via-card via-form" method="post" action="/me">
        ${like ? '<p class="via-notice">Add your name to like that build. We will save the like and take you back.</p>' : ''}
        ${error ? `<p class="via-error">${escapeHtml(error)}</p>` : ''}
        ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : ''}
        ${like ? `<input type="hidden" name="like" value="${escapeHtml(like)}">` : ''}
        <div class="via-field-row"><label class="via-label">Name</label><input class="via-input" name="display_name" required value="${escapeHtml(person?.display_name || '')}"></div>
        <div class="via-field-row"><label class="via-label">Pseudonym</label><input class="via-input" name="pseudonym" value="${escapeHtml(person?.pseudonym || '')}"></div>
        <div class="via-field-row"><label class="via-label">Discord id</label><input class="via-input" name="discord_id" value="${escapeHtml(person?.discord_id || '')}"></div>
        <div class="via-field-row"><label class="via-label">GitHub</label><input class="via-input" name="github" value="${escapeHtml(person?.github || '')}"></div>
        <div class="via-field-row"><label class="via-label">X</label><input class="via-input" name="x" value="${escapeHtml(person?.x || '')}"></div>
        <div class="via-field-row"><label class="via-label">Skills</label><input class="via-input" name="skills" value="${escapeHtml(person?.skills || '')}"></div>
        <div class="via-field-row"><label class="via-label">Looking for</label><input class="via-input" name="looking_for" value="${escapeHtml(person?.looking_for || '')}"></div>
        <div class="via-actions"><button type="submit" class="via-btn via-btn--primary">${caps('Save')}</button></div>
      </form>
      <a class="via-back" href="/">← ${caps('Builds')}</a>`,
  });
}

/** Minimal terms for Discord Developer Portal. No invented domain. */
export function renderTerms() {
  return layout({
    title: 'Terms · Via',
    active: null,
    main: `
      <section class="via-hero via-hero--slim via-enter">
        <p class="via-label">${caps('legal')}</p>
        <h1 class="via-display">${caps('Terms')}</h1>
      </section>
      <article class="via-glass via-card via-legal">
        <p>Via is a public leaderboard for hackathon projects and builders in one Discord guild. By using the bot or the thin pages you agree to these terms.</p>
        <p class="via-label">Use</p>
        <p>Use Via for ranking, liking, opt-in profiles, and community intros tied to that guild. Do not abuse the bot, spam likes, or submit content you do not have rights to post.</p>
        <p class="via-label">Content</p>
        <p>You keep ownership of what you submit. Projects and profile fields you post may appear on the public leaderboard and in Discord embeds for that guild.</p>
        <p class="via-label">Availability</p>
        <p>Via is provided as-is for the community. The operators may change or stop the service without notice.</p>
        <p class="via-label">Contact</p>
        <p>Questions go through the Via Discord guild operators. Privacy details are on <a href="/privacy">/privacy</a>.</p>
      </article>
      <a class="via-back" href="/">← ${caps('Builds')}</a>`,
  });
}

/**
 * Privacy for Discord Developer Portal.
 * States Discord user id, opt-in profile, likes, intro/speaker logs; no secret scraping.
 */
export function renderPrivacy() {
  return layout({
    title: 'Privacy · Via',
    active: null,
    main: `
      <section class="via-hero via-hero--slim via-enter">
        <p class="via-label">${caps('legal')}</p>
        <h1 class="via-display">${caps('Privacy')}</h1>
      </section>
      <article class="via-glass via-card via-legal">
        <p>Via stores only what you choose to put in the Ontology for one Discord guild and the thin web pages. There is no secret scraping.</p>
        <p class="via-label">What we store</p>
        <ul>
          <li><strong>Discord user id</strong> — when you use the bot (slash commands, Like), so likes and actions attach to you in that guild.</li>
          <li><strong>Opt-in profile</strong> — fields you save on <span class="via-mono">/me</span> (name, optional Discord id, GitHub, X, skills, looking-for). Blank fields stay blank.</li>
          <li><strong>Likes</strong> — who liked which project and the signal type, so the board can re-rank by conviction.</li>
          <li><strong>Intro / speaker logs</strong> — when those commands run, Via logs the match or shortlist attempt (who, topic, reason or failure) in the Ontology so a failed match stays honest.</li>
        </ul>
        <p class="via-label">What we do not do</p>
        <p>Via does not scrape DMs, message history, or private channels. It does not harvest friends lists, presence, or credentials. It does not sell personal data.</p>
        <p class="via-label">Where it lives</p>
        <p>Facts sit in the guild’s SQLite Ontology (or the host you deploy). Operators of that instance control retention and deletion.</p>
        <p class="via-label">Your choices</p>
        <p>Skip <span class="via-mono">/me</span> if you do not want a profile. Ask a guild operator to remove your Person, likes, or logs. Terms are on <a href="/terms">/terms</a>.</p>
      </article>
      <a class="via-back" href="/">← ${caps('Builds')}</a>`,
  });
}

function rowHtml(row, origin = publicUrl()) {
  const project = row.project;
  const builders = row.builders.map((person) => person.display_name).filter(Boolean);
  const metaBits = [builders.length ? builders.join(' · ') : '', project.hackathon || ''].filter(Boolean);
  const thumb = projectThumbSrc(project, origin);
  const projectHref = `/p/${encodeURIComponent(project.id)}`;
  const anchor = `p-${String(project.id).replace(/^prj_/, '')}`;
  const cardClass = ['via-card', 'via-card--post', row.rank === 1 ? 'via-card--rank1' : '', medalClass(row.rank), row.capped ? 'is-capped' : '']
    .filter(Boolean).join(' ');
  return `<li class="${cardClass}" id="${escapeHtml(anchor)}">
    <a class="via-thumb" href="${escapeHtml(projectHref)}">
      <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caps(project.title || 'untitled'))}" width="1080" height="1350" loading="lazy">
      ${rankBadge(row.rank, row.delta)}
    </a>
    <div class="via-card__body">
      <h2 class="via-sr">${escapeHtml(project.title || 'untitled')}</h2>
      ${scoreBar(row.score, row.likes)}
      ${metaBits.length ? `<p class="via-meta-line">${escapeHtml(metaBits.join(' · '))}</p>` : ''}
      <div class="via-card__foot">
        ${pathButtons(project)}
        ${likeForm(project, row.likes, `/#${anchor}`)}
      </div>
    </div>
  </li>`;
}

function builderRowHtml(row) {
  const best = row.best;
  const bestHref = best ? `/p/${encodeURIComponent(best.project.id)}` : null;
  const handle = row.person.github ? `<a class="via-path" href="https://github.com/${escapeHtml(row.person.github)}">GitHub</a>` : '';
  return `<li class="via-person ${medalClass(row.rank)}">
    <span class="via-person__rank"><span class="via-rank">${String(row.rank).padStart(2, '0')}</span>${deltaHtml(row.delta)}</span>
    ${best ? `<a class="via-person__thumb" href="${escapeHtml(bestHref)}"><img src="${escapeHtml(projectThumbSrc(best.project))}" alt="" width="1080" height="1350" loading="lazy"></a>` : '<span class="via-person__thumb"></span>'}
    <div class="via-person__body">
      <h2 class="via-display via-person__name">${escapeHtml(caps(row.person.display_name || 'builder'))}${medalName(row.rank) ? ` <span class="via-medal">${caps(medalName(row.rank))}</span>` : ''}</h2>
      <p class="via-meta-line">${row.builds.length} ${row.builds.length === 1 ? 'build' : 'builds'} · ${row.likes} likes${best ? ` · best <a href="${escapeHtml(bestHref)}">#${best.rank} ${escapeHtml(best.project.title || '')}</a>` : ''}</p>
      ${scoreBar(Math.min(100, row.score / Math.max(1, row.top) * 100), row.likes)}
    </div>
    <span class="via-person__score">${Math.round(row.score)}<small>pts</small></span>
    ${handle}
  </li>`;
}

function projectThumbSrc(project, origin = publicUrl()) {
  if (project.thumbnail_url && /^https?:\/\//i.test(project.thumbnail_url)) {
    // Prefer local /thumbs when the absolute URL points at our own host path
    try {
      const u = new URL(project.thumbnail_url);
      if (u.pathname.startsWith('/thumbs/')) return u.pathname;
    } catch {
      /* use as-is */
    }
    return project.thumbnail_url;
  }
  return thumbRelPath(project.id);
}

function pathButtons(project) {
  const links = [
    project.demo_url ? `<a class="via-path" href="${escapeHtml(project.demo_url)}">Demo</a>` : null,
    project.repo_url ? `<a class="via-path" href="${escapeHtml(project.repo_url)}">Repo</a>` : null,
    project.source_url ? `<a class="via-path" href="${escapeHtml(project.source_url)}">Page</a>` : null,
  ].filter(Boolean);
  return links.length ? `<div class="via-paths">${links.join('')}</div>` : '';
}

function layout({ title, active, main, meta = null }) {
  const face = displayFontFace('/fonts/');
  const displayOverride = displayStackCss();
  const og = meta
    ? `
<meta name="description" content="${escapeHtml(meta.description || '')}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(meta.title || title)}">
<meta property="og:description" content="${escapeHtml(meta.description || '')}">
<meta property="og:image" content="${escapeHtml(meta.image)}">
<meta property="og:url" content="${escapeHtml(meta.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title || title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description || '')}">
<meta name="twitter:image" content="${escapeHtml(meta.image)}">`
    : '';
  const link = (key, href, label) => `<li><a href="${href}"${active === key ? ' aria-current="page" class="is-active"' : ''}>${caps(label)}</a></li>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#080808">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">
<link rel="icon" type="image/png" sizes="512x512" href="/via-discord-icon-512.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${og}
<style>${face}
${displayOverride}
</style>
<link rel="stylesheet" href="/via-ui.css">
<style>
  a, a:hover, a:visited { text-decoration: none; color: inherit; }
  html, body { overflow-x: hidden; }
  .via-shell { width: min(1120px, calc(100% - 32px)); margin-inline: auto; }
  .via-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; margin-bottom: 8px; flex-wrap: nowrap; }
  .via-nav nav { min-width: 0; }
  .via-nav__brand { display: inline-flex; align-items: center; flex: none; }
  .via-nav__brand img { display: block; width: 44px; height: 44px; border-radius: 10px; }
  .via-nav__links { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; flex-wrap: wrap; justify-content: flex-end; }
  .via-nav__links a { display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 999px; color: var(--via-muted); font-family: var(--via-font-ui); font-size: 13px; letter-spacing: 0.08em; }
  .via-nav__links a:hover { color: var(--via-ink); }
  .via-nav__links a.is-active { color: var(--via-ink); background: rgba(255,255,255,0.08); }
  .via-hero { padding: 40px 0 32px; }
  .via-hero .via-display { margin: 0; font-size: clamp(2.75rem, 9vw, 5rem); line-height: 1; letter-spacing: 0.01em; }
  .via-hero--slim { padding-block: 28px; }
  .via-lede { margin: 14px 0 0; color: var(--via-muted); font-family: var(--via-font-ui); font-weight: 400; font-size: 15px; }
  .via-board { list-style: none; margin: 0 0 48px; padding: 0; display: grid; gap: 28px 24px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
  @media (min-width: 900px) { .via-board { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); } }
  .via-card--post { display: flex; flex-direction: column; gap: 14px; min-width: 0; max-width: 360px; width: 100%; margin: 0 auto; padding: 0; background: transparent; border: 0; box-shadow: none; backdrop-filter: none; }
  .via-thumb { display: block; position: relative; margin: 0; background: #121212; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
  .via-thumb img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; border: 0; transition: transform 240ms ease; }
  a.via-thumb:hover img { transform: scale(1.02); }
  .via-rank-badge { position: absolute; left: 12px; top: 12px; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 10px; border-radius: 12px; background: rgba(8,8,8,0.82); backdrop-filter: blur(6px); }
  .via-rank-badge .via-rank, .via-person__rank .via-rank { font-family: var(--via-font-display); font-size: 2.5rem; line-height: 1; color: #f2f2f2; letter-spacing: 0.02em; position: static; }
  .via-medal { display: inline-block; padding: 3px 8px; border-radius: 999px; font-family: var(--via-font-ui); font-size: 11px; letter-spacing: 0.12em; color: #080808; background: #f2f2f2; vertical-align: middle; }
  .via-delta { font-family: var(--via-font-ui); font-size: 13px; letter-spacing: 0.04em; white-space: nowrap; }
  .via-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .via-delta--up { color: #7cff77; }
  .via-delta--down { color: #ff5a1f; }
  .via-delta--flat { color: var(--via-muted); }
  .is-gold { --medal: #f2c94c; } .is-silver { --medal: #c9d1d9; } .is-bronze { --medal: #d08a4f; }
  .is-gold .via-thumb, .is-silver .via-thumb, .is-bronze .via-thumb { border: 2px solid var(--medal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--medal) 18%, transparent); }
  .is-gold .via-rank, .is-silver .via-rank, .is-bronze .via-rank { color: var(--medal); }
  .is-gold .via-medal, .is-silver .via-medal, .is-bronze .via-medal { background: var(--medal); }
  .is-gold .via-bar__fill, .is-silver .via-bar__fill, .is-bronze .via-bar__fill { background: var(--medal); }
  .via-card__body { display: flex; flex-direction: column; gap: 10px; padding: 0 2px; min-width: 0; flex: 1; }
  .via-card--post .via-card__foot { margin-top: auto; }
  .via-card__title { margin: 0; font-size: 1.6rem; line-height: 1.1; overflow-wrap: anywhere; }
  .via-liner { margin: 0; color: var(--via-ink); font-family: var(--via-font-ui); font-weight: 400; font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
  .via-card--post .via-liner { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .via-meta-line, .via-reason { margin: 0; color: var(--via-muted); font-family: var(--via-font-ui); font-weight: 400; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
  .via-meta-line a { color: var(--via-ink); }
  .via-points { display: grid; grid-template-columns: 3.2ch 1fr; gap: 10px; align-items: center; width: 100%; }
  .via-points__n { font-family: var(--via-font-display); font-size: 1.25rem; line-height: 1; }
  .via-bar { display: block; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .via-bar__fill { display: block; height: 100%; background: #ff5a1f; border-radius: inherit; }
  .via-card__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .via-paths { display: flex; flex-wrap: wrap; gap: 6px; }
  .via-path { display: inline-flex; align-items: center; min-height: 30px; padding: 0 11px; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; color: var(--via-muted); font-family: var(--via-font-ui); font-size: 12px; font-weight: 400; letter-spacing: 0.04em; white-space: nowrap; }
  .via-path:hover { color: var(--via-ink); border-color: rgba(255,255,255,0.32); }
  .via-like { margin: 0 0 0 auto; }
  .via-like .via-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 14px; white-space: nowrap; background: #ff5a1f; border-color: #ff5a1f; color: #080808; font-family: var(--via-font-ui); font-size: 12px; letter-spacing: 0.08em; cursor: pointer; }
  .via-like .via-btn:hover { background: #ff7444; border-color: #ff7444; color: #080808; }
  .like-count { display: inline-block; min-width: 1.6em; padding: 1px 6px; border-radius: 999px; background: rgba(8,8,8,0.18); text-align: center; }
  .via-project { display: grid; gap: 32px; grid-template-columns: minmax(0, 400px) minmax(0, 1fr); align-items: start; margin: 24px 0 32px; }
  .via-project__body { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .via-project__body .via-label { margin: 0; }
  .via-project__title { margin: 0; font-size: clamp(2.25rem, 6vw, 3.5rem); line-height: 1.02; overflow-wrap: anywhere; }
  .via-project .via-liner { font-size: 18px; max-width: 40em; }
  .via-facts { display: grid; gap: 10px; margin: 0; font-family: var(--via-font-ui); font-size: 14px; }
  .via-facts div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
  .via-facts dt { color: var(--via-muted); letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; }
  .via-facts dd { margin: 0; overflow-wrap: anywhere; }
  .via-people { list-style: none; margin: 0 0 48px; padding: 0; display: grid; gap: 12px; }
  .via-person { display: grid; grid-template-columns: 88px 64px minmax(0, 1fr) auto auto; gap: 18px; align-items: center; padding: 14px 18px; border-radius: 16px; background: #121212; border: 1px solid rgba(255,255,255,0.06); }
  .via-person.is-gold, .via-person.is-silver, .via-person.is-bronze { border-color: var(--medal); }
  .via-person__rank { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .via-person__rank .via-delta { position: static; padding: 0; background: none; font-size: 12px; }
  .via-person__thumb { display: block; width: 64px; border-radius: 10px; overflow: hidden; background: #1a1a1a; aspect-ratio: 4 / 5; }
  .via-person__thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .via-person__body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .via-person__name { margin: 0; font-size: 1.4rem; line-height: 1.1; overflow-wrap: anywhere; }
  .via-person__name .via-medal { margin-left: 6px; }
  .via-person__body .via-points { grid-template-columns: 1fr; }
  .via-person__body .via-points__n { display: none; }
  .via-person__score { font-family: var(--via-font-display); font-size: 1.75rem; line-height: 1; white-space: nowrap; }
  .via-person__score small { margin-left: 4px; font-family: var(--via-font-ui); font-size: 12px; color: var(--via-muted); letter-spacing: 0.08em; }
  .via-back { display: inline-block; margin: 8px 0 48px; color: var(--via-muted); font-family: var(--via-font-ui); font-size: 13px; letter-spacing: 0.08em; }
  .via-back:hover { color: var(--via-ink); }
  .via-form { display: grid; gap: 16px; max-width: 640px; }
  .via-form .via-actions .via-btn--primary { background: #ff5a1f; border-color: #ff5a1f; color: #080808; min-width: 140px; }
  .via-legal { display: grid; gap: 16px; max-width: 760px; }
  .via-legal p, .via-legal li { margin: 0; }
  .via-legal ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
  .via-legal a { color: #ff5a1f; }
  .via-notice { margin: 0 0 16px; padding: 12px 16px; border-radius: 12px; background: rgba(255,90,31,0.12); border: 1px solid rgba(255,90,31,0.4); font-family: var(--via-font-ui); font-size: 14px; }
  .via-footer { display: flex; gap: 16px; flex-wrap: wrap; padding: 24px 0 40px; border-top: 1px solid rgba(255,255,255,0.08); color: var(--via-muted); font-family: var(--via-font-ui); font-size: 12px; letter-spacing: 0.06em; }
  .via-footer a:hover { color: var(--via-ink); }
  @media (max-width: 760px) {
    .via-project { grid-template-columns: 1fr; gap: 20px; }
    .via-project .via-thumb--hero { max-width: 420px; }
    .via-person { grid-template-columns: 56px minmax(0, 1fr) auto; gap: 12px; padding: 12px 14px; }
    .via-person__thumb, .via-person > .via-path { display: none; }
    .via-person__rank .via-rank { font-size: 1.9rem; }
    .via-person__score { font-size: 1.3rem; }
  }
  @media (max-width: 600px) {
    .via-board { grid-template-columns: minmax(0, 1fr); }
    .via-card--post { max-width: 420px; }
  }
  @media (max-width: 520px) {
    .via-shell { width: calc(100% - 24px); }
    .via-nav { gap: 8px; }
    .via-nav__links { gap: 0; }
    .via-nav__brand img { width: 38px; height: 38px; }
    .via-nav__links a { padding: 0 8px; font-size: 11px; letter-spacing: 0.04em; }
  }
</style>
</head>
<body class="via-field" id="top">
  <div class="via-shell">
    <header class="via-nav">
      <a class="via-nav__brand" href="/" aria-label="Via home"><img src="/via-discord-icon-512.png" alt="Via" width="44" height="44"></a>
      <nav aria-label="Primary">
        <ul class="via-nav__links">
          ${link('builds', '/', 'Builds')}
          ${link('builders', '/builders', 'Builders')}
          ${link('new', '/p/new', 'Submit')}
          ${link('me', '/me', 'Me')}
        </ul>
      </nav>
    </header>
    <main>
    ${main}
    </main>
    <footer class="via-footer"><span>Via · London hackathon community</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/api/board">API</a></footer>
  </div>
  <script>
    (function () {
      var key = 'via_name';
      var stored = '';
      try { stored = localStorage.getItem(key) || ''; } catch (e) {}
      document.querySelectorAll('.like-name').forEach(function (el) { if (!el.value) el.value = stored; });
      var me = document.querySelector('form[action="/me"] input[name="display_name"]');
      if (me) {
        if (!me.value && stored) me.value = stored;
        me.form.addEventListener('submit', function () {
          try { localStorage.setItem(key, me.value.trim()); } catch (e) {}
        });
      }
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
