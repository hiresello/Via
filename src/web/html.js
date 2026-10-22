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
    title: 'Via · the bar',
    active: 'bar',
    origin,
    main: `
      <section class="via-hero via-enter">
        <h1 class="via-display">${caps('Who pushed')}</h1>
        <p class="via-lede">${board.rows.length} projects</p>
      </section>
      <ol class="via-board">${rows}</ol>
      ${empty}`,
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
      <a class="via-back" href="/">Via · back to the bar</a>`,
  });
}

export function renderProject(row, { origin = publicUrl() } = {}) {
  const project = row.project;
  const thumb = projectThumbSrc(project, origin);
  const pageUrl = `${origin}/p/${encodeURIComponent(project.id)}`;
  const builders = row.builders.map((person) => escapeHtml(person.display_name)).filter(Boolean).join(' · ');
  return layout({
    title: `${project.title || 'Project'} · Via`,
    active: 'bar',
    origin,
    meta: {
      title: caps(project.title || 'Via project'),
      description: project.one_liner || 'A build on the Via public bar.',
      image: thumb.startsWith('http') ? thumb : `${origin}${thumb}`,
      url: pageUrl,
    },
    main: `
      <article class="via-project via-enter">
        <a class="via-thumb via-thumb--hero" href="${escapeHtml(pageUrl)}">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caps(project.title || 'untitled'))}" width="1080" height="1350" decoding="sync" fetchpriority="high">
        </a>
        <section class="via-card__body">
          <h1 class="via-display via-card__title">${escapeHtml(caps(project.title || 'untitled'))}</h1>
          ${project.one_liner ? `<p class="via-liner">${escapeHtml(project.one_liner)}</p>` : ''}
          <p class="via-meta-line">${[builders, project.hackathon ? escapeHtml(project.hackathon) : ''].filter(Boolean).join(' · ')}</p>
          ${pathButtons(project)}
          ${specificReason(row.reason) ? `<p class="via-reason">${escapeHtml(specificReason(row.reason))}</p>` : ''}
          <form method="post" action="/like" class="via-actions like">
            <input type="hidden" name="project_id" value="${escapeHtml(project.id)}">
            <input type="hidden" name="signal" value="like">
            <input type="hidden" name="display_name" class="like-name" value="">
            <button type="submit" class="via-btn via-btn--primary like-btn">Like · <span class="like-count">${row.likes}</span></button>
          </form>
        </section>
      </article>
      <a class="via-back" href="/">Via · back to the bar</a>`,
  });
}

export function renderMe(person, error) {
  return layout({
    title: 'Me · Via',
    active: 'me',
    main: `
      <section class="via-hero via-hero--slim via-enter">
        <p class="via-label">${caps('profile')}</p>
        <h1 class="via-display">${caps(person?.display_name || 'Your name')}</h1>
      </section>
      <form class="via-glass via-card via-form" method="post" action="/me">
        ${error ? `<p class="via-error">${escapeHtml(error)}</p>` : ''}
        <div class="via-field-row"><label class="via-label">Name</label><input class="via-input" name="display_name" required value="${escapeHtml(person?.display_name || '')}"></div>
        <div class="via-field-row"><label class="via-label">Pseudonym</label><input class="via-input" name="pseudonym" value="${escapeHtml(person?.pseudonym || '')}"></div>
        <div class="via-field-row"><label class="via-label">Discord id</label><input class="via-input" name="discord_id" value="${escapeHtml(person?.discord_id || '')}"></div>
        <div class="via-field-row"><label class="via-label">GitHub</label><input class="via-input" name="github" value="${escapeHtml(person?.github || '')}"></div>
        <div class="via-field-row"><label class="via-label">X</label><input class="via-input" name="x" value="${escapeHtml(person?.x || '')}"></div>
        <div class="via-field-row"><label class="via-label">Skills</label><input class="via-input" name="skills" value="${escapeHtml(person?.skills || '')}"></div>
        <div class="via-field-row"><label class="via-label">Looking for</label><input class="via-input" name="looking_for" value="${escapeHtml(person?.looking_for || '')}"></div>
        <div class="via-actions"><button type="submit" class="via-btn via-btn--primary">${caps('Save')}</button></div>
      </form>
      <a class="via-back" href="/">Via · back to the bar</a>`,
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
        <p>Via is a public bar for hackathon projects in one Discord guild. By using the bot or the thin pages you agree to these terms.</p>
        <p class="via-label">Use</p>
        <p>Use Via for ranking, liking, opt-in profiles, and community intros tied to that guild. Do not abuse the bot, spam likes, or submit content you do not have rights to post.</p>
        <p class="via-label">Content</p>
        <p>You keep ownership of what you submit. Projects and profile fields you post may appear on the public leaderboard and in Discord embeds for that guild.</p>
        <p class="via-label">Availability</p>
        <p>Via is provided as-is for the community. The operators may change or stop the service without notice.</p>
        <p class="via-label">Contact</p>
        <p>Questions go through the Via Discord guild operators. Privacy details are on <a href="/privacy">/privacy</a>.</p>
      </article>
      <a class="via-back" href="/">Via · back to the bar</a>`,
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
          <li><strong>Likes</strong> — who liked which project and the signal type, so the bar can re-rank by conviction.</li>
          <li><strong>Intro / speaker logs</strong> — when those commands run, Via logs the match or shortlist attempt (who, topic, reason or failure) in the Ontology so a failed match stays honest.</li>
        </ul>
        <p class="via-label">What we do not do</p>
        <p>Via does not scrape DMs, message history, or private channels. It does not harvest friends lists, presence, or credentials. It does not sell personal data.</p>
        <p class="via-label">Where it lives</p>
        <p>Facts sit in the guild’s SQLite Ontology (or the host you deploy). Operators of that instance control retention and deletion.</p>
        <p class="via-label">Your choices</p>
        <p>Skip <span class="via-mono">/me</span> if you do not want a profile. Ask a guild operator to remove your Person, likes, or logs. Terms are on <a href="/terms">/terms</a>.</p>
      </article>
      <a class="via-back" href="/">Via · back to the bar</a>`,
  });
}

function rowHtml(row, origin = publicUrl()) {
  const project = row.project;
  const rank1 = row.rank === 1;
  const builders = row.builders.map((person) => person.display_name).filter(Boolean);
  const metaBits = [
    builders.length ? builders.join(' · ') : '',
    project.hackathon || '',
  ].filter(Boolean);
  const reason = specificReason(row.reason);
  const thumb = projectThumbSrc(project, origin);
  const projectHref = `/p/${encodeURIComponent(project.id)}`;
  const cardClass = rank1
    ? 'via-card via-card--rank1 via-card--post via-enter'
    : 'via-card via-card--post';
  return `<li class="${cardClass}">
    <a class="via-thumb" href="${escapeHtml(projectHref)}">
      <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caps(project.title || 'untitled'))}" width="1080" height="1350" loading="lazy">
    </a>
    <div class="via-card__body">
      <div class="via-card__head">
        <div class="via-rank">${caps(String(row.rank).padStart(2, '0'))}</div>
        <form method="post" action="/like" class="via-actions like">
          <input type="hidden" name="project_id" value="${escapeHtml(project.id)}">
          <input type="hidden" name="signal" value="like">
          <input type="hidden" name="display_name" class="like-name" value="">
          <button type="submit" class="via-btn via-btn--primary like-btn" aria-label="Like ${escapeHtml(project.title || '')}">
            Like · <span class="like-count">${row.likes}</span>
          </button>
        </form>
      </div>
      <h2 class="via-display via-card__title"><a href="${escapeHtml(projectHref)}">${escapeHtml(caps(project.title || 'untitled'))}</a></h2>
      ${project.one_liner ? `<p class="via-liner">${escapeHtml(project.one_liner)}</p>` : ''}
      ${metaBits.length ? `<p class="via-meta-line">${escapeHtml(metaBits.join(' · '))}</p>` : ''}
      ${pathButtons(project)}
      ${reason ? `<p class="via-reason">${escapeHtml(reason)}</p>` : ''}
    </div>
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
  // Apestron when local trial file / VIA_DISPLAY_FONT; else OFL Syne (clone default). Never Inter.
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${og}
<style>${face}
${displayOverride}
</style>
<link rel="stylesheet" href="/via-ui.css">
<style>
  a, a:hover, a:visited { text-decoration: none; }
  .via-shell { width: min(720px, calc(100% - 48px)); }
  .via-nav { margin-bottom: 8px; }
  .via-nav__links a { color: var(--via-muted); }
  .via-hero { padding: 48px 0 40px; }
  .via-hero .via-display { font-size: clamp(3.25rem, 8vw, 4.75rem); letter-spacing: 0.01em; }
  .via-lede { margin: 16px 0 0; color: var(--via-muted); font-family: var(--via-font-ui); font-weight: 400; font-size: 15px; }
  .via-board { list-style: none; margin: 0; padding: 0; display: grid; gap: 56px; }
  .via-card--post {
    display: grid; gap: 16px; padding: 0; margin: 0; overflow: hidden;
    background: transparent; border: 0; box-shadow: none; backdrop-filter: none;
  }
  .via-card--post .via-card__body { padding: 4px 0 0; display: grid; gap: 12px; }
  .via-card__title { font-size: clamp(1.75rem, 4vw, 2.35rem); }
  .via-thumb { display: block; margin: 0; background: #080808; border-radius: 16px; overflow: hidden; }
  .via-thumb img {
    display: block; width: 100%; height: auto; aspect-ratio: 4 / 5;
    object-fit: cover; border: 0;
  }
  .via-thumb--hero { border-radius: 16px; }
  .via-liner, .via-reason, .via-meta-line { margin: 0; font-family: var(--via-font-ui); font-weight: 400; }
  .via-liner { color: var(--via-ink); font-size: 16px; line-height: 1.45; max-width: 42em; }
  .via-meta-line { color: var(--via-muted); font-size: 14px; }
  .via-reason { color: var(--via-muted); font-size: 14px; }
  .via-paths { display: flex; flex-wrap: wrap; gap: 8px; }
  .via-path {
    display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px;
    border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
    color: var(--via-muted); font-family: var(--via-font-ui); font-size: 12px; font-weight: 400;
    letter-spacing: 0.04em;
  }
  .via-path:hover { color: var(--via-ink); border-color: rgba(255,255,255,0.28); }
  .via-project { display: grid; gap: 20px; }
  .via-back { color: var(--via-muted); text-decoration: none; }
  .via-form { display: grid; gap: 16px; }
  .via-legal { display: grid; gap: 16px; }
  .via-legal p, .via-legal li { margin: 0; }
  .via-legal ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
  .via-hero--slim { padding-block: 32px; }
</style>
</head>
<body class="via-field" id="top">
  <div class="via-shell">
    <header class="via-nav">
      <a class="via-nav__brand" href="/">${caps('Via')}</a>
      <nav>
        <ul class="via-nav__links">
          <li><a href="/" ${active === 'bar' ? 'aria-current="page" class="is-active"' : ''}>Bar</a></li>
          <li><a href="/p/new" ${active === 'new' ? 'aria-current="page" class="is-active"' : ''}>Submit</a></li>
          <li><a href="/me" ${active === 'me' ? 'aria-current="page" class="is-active"' : ''}>Me</a></li>
        </ul>
      </nav>
    </header>
    ${main}
  </div>
  <script>
    (function () {
      var key = 'via_name';
      var names = document.querySelectorAll('.like-name');
      var stored = '';
      try { stored = localStorage.getItem(key) || ''; } catch (e) {}
      names.forEach(function (el) { if (!el.value) el.value = stored; });
      var me = document.querySelector('form[action="/me"] input[name="display_name"]');
      if (me) {
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
