import path from 'node:path';
import { hasOpenRouterKey, OPENROUTER_MODEL } from './decision.js';
import { loadEnv } from './env.js';
import { rootDir } from './paths.js';
import { rankProjects } from './ranker.js';
import { slug } from './slug.js';
import { generateProjectThumb, thumbAbsoluteUrl, thumbFileName } from './thumb.js';

export function boardSignature(ontology) {
  const projects = ontology.query({ type: 'Project' }).map((row) => row.id).sort();
  const likes = ontology.query({ type: 'Like' })
    .filter((row) => !row.retracted)
    .map((row) => `${row.project_id}:${row.signal || 'like'}`)
    .sort();
  return `${projects.join(',')}|${likes.join(',')}`;
}

export async function rankBoard(ontology, opts = {}) {
  loadEnv(path.join(rootDir, '.env'));
  const signature = boardSignature(ontology);
  const wantModel = !opts.forceStub && hasOpenRouterKey();
  const cached = latestSnapshot(ontology);
  if (cached && cached.cache_key === signature) {
    // A System One success for this signature is durable. A stub is reused only
    // when no key is set; after an error the next request retries (unchanged
    // projects are still served from their ModelScore cache).
    if (wantModel && cached.model === OPENROUTER_MODEL) return presentBoard(ontology);
    if (!wantModel && cached.model === 'stub') return presentBoard(ontology);
  }
  const projects = ontology.query({ type: 'Project' });
  const ranked = await rankProjects(ontology, projects, {
    ...opts,
    forceStub: opts.forceStub || !hasOpenRouterKey(),
  });
  ontology.write({
    type: 'RankSnapshot',
    id: `rank_${Date.now()}_${String(snapshotSeq()).padStart(4, '0')}`,
    model: ranked.model,
    chosen_by: ranked.chosen_by,
    model_error: ranked.model_error ?? null,
    cache_key: signature,
    ordered: ranked.ordered.map((row, index) => ({
      project_id: row.project_id,
      score: row.score,
      reason: row.reason,
      likes: row.likes,
      capped: row.capped,
      rank: index + 1,
    })),
    created_at: new Date().toISOString(),
  });
  return presentBoard(ontology);
}

export async function likeProject(ontology, { userId, projectId, signal = 'like' }, opts = {}) {
  if (!userId || !projectId) throw new Error('like requires userId and projectId');
  const id = `like:${userId}:${projectId}`;
  const existing = ontology.query({ type: 'Like' }).find((row) => row.id === id);
  if (existing && !existing.retracted) {
    ontology.write({ ...existing, retracted: true, ts: new Date().toISOString() });
  } else {
    ontology.write({
      type: 'Like',
      id,
      user_id: userId,
      project_id: projectId,
      signal: signal || 'like',
      retracted: false,
      ts: new Date().toISOString(),
    });
  }
  return rankBoard(ontology, opts);
}

export function ensurePerson(ontology, { displayName, discordId = null }) {
  const name = displayName && String(displayName).trim();
  if (!name && !discordId) throw new Error('person needs a name or discord id');
  const id = discordId ? `per_${slug(discordId)}` : `per_${slug(name)}`;
  const existing = ontology.query({ type: 'Person' }).find((row) => row.id === id);
  if (existing) return existing;
  return ontology.write({
    type: 'Person',
    id,
    discord_id: discordId,
    display_name: name,
    pseudonym: null,
    socials: null,
    github: null,
    x: null,
    skills: null,
    looking_for: null,
  });
}

const LIMITS = { title: 80, one_liner: 280, builders: 400, organizers: 200, hackathon: 120 };

function cleanUrl(value, label) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be a full http(s) link`); }
  if (!['http:', 'https:'].includes(url.protocol) || raw.length > 500) throw new Error(`${label} must be a full http(s) link`);
  return url.href;
}

export async function submitProject(ontology, rawInput, opts = {}) {
  const input = { ...rawInput };
  for (const [field, max] of Object.entries(LIMITS)) {
    if (input[field] != null && String(input[field]).trim().length > max) throw new Error(`${field.replace('_', ' ')} is too long (max ${max})`);
  }
  for (const [field, label] of [['demo_url', 'Demo'], ['repo_url', 'Repo'], ['source_url', 'Page'], ['thumbnail_url', 'Thumbnail'], ['image_url', 'Image']]) {
    if (field in input) input[field] = cleanUrl(input[field], label);
  }
  const title = input.title && String(input.title).trim();
  if (!title) throw new Error('title is required');
  if (!slug(title)) throw new Error('title needs at least one letter or number');
  const builders = String(input.builders || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const builderIds = builders.map((name) => ensurePerson(ontology, { displayName: name }).id);
  const organizerNames = String(input.organizers || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const hackathon = input.hackathon?.trim() || null;
  let eventId = null;
  if (hackathon) {
    eventId = `evt_${slug(hackathon)}`;
    const existingEvent = ontology.query({ type: 'Event' }).find((row) => row.id === eventId);
    if (!existingEvent) {
      ontology.write({
        type: 'Event',
        id: eventId,
        title: hackathon,
        year: null,
        starts_at: null,
        ends_at: null,
        city: null,
        luma_url: null,
      });
    }
  }
  const organizerIds = organizerNames.map((name) => {
    const id = `org_${slug(name)}`;
    const existing = ontology.query({ type: 'Organizer' }).find((row) => row.id === id);
    if (!existing) {
      ontology.write({ type: 'Organizer', id, name, person_id: null, event_id: eventId });
    }
    return id;
  });
  const id = `prj_${slug(title)}`;
  const people = builderIds
    .map((pid) => ontology.query({ type: 'Person' }).find((p) => p.id === pid))
    .filter(Boolean);
  let image_path = null;
  let thumbnail_url = input.thumbnail_url?.trim() || input.image_url?.trim() || null;
  if (thumbnail_url && /^https?:\/\//i.test(thumbnail_url)) {
    image_path = null;
  } else {
    const thumb = await generateProjectThumb(
      { id, title, one_liner: input.one_liner?.trim() || null, hackathon },
      { builders: people },
    );
    image_path = thumb.image_path;
    thumbnail_url = thumb.thumbnail_url;
  }
  ontology.write({
    type: 'Project',
    id,
    title,
    one_liner: input.one_liner?.trim() || null,
    year: null,
    hackathon,
    event_id: eventId,
    builder_ids: builderIds,
    organizer_ids: organizerIds,
    organizers: organizerNames,
    source_url: input.source_url?.trim() || null,
    demo_url: input.demo_url?.trim() || null,
    repo_url: input.repo_url?.trim() || null,
    urls: [input.demo_url, input.repo_url, input.source_url].filter((item) => item && item.trim()),
    image_path: image_path || (thumbnail_url ? null : `public/thumbs/${thumbFileName(id)}`),
    thumbnail_url: thumbnail_url || thumbAbsoluteUrl(id),
  });
  return rankBoard(ontology, opts);
}

export function saveProfile(ontology, input) {
  const name = input.display_name?.trim();
  if (!name) throw new Error('display name is required');
  if (name.length > 60 || !slug(name)) throw new Error('display name must be 1–60 characters with a letter or number');
  for (const field of ['pseudonym', 'discord_id', 'github', 'x', 'skills', 'looking_for']) {
    if (input[field] != null && String(input[field]).trim().length > 200) throw new Error(`${field.replace('_', ' ')} is too long (max 200)`);
  }
  const id = input.discord_id?.trim()
    ? `per_${slug(input.discord_id.trim())}`
    : `per_${slug(name)}`;
  const existing = ontology.query({ type: 'Person' }).find((row) => row.id === id);
  return ontology.write({
    type: 'Person',
    id,
    discord_id: input.discord_id?.trim() || existing?.discord_id || null,
    display_name: name,
    pseudonym: input.pseudonym?.trim() || null,
    socials: existing?.socials || null,
    github: input.github?.trim() || null,
    x: input.x?.trim() || null,
    skills: input.skills?.trim() || null,
    looking_for: input.looking_for?.trim() || null,
  });
}

export function presentBoard(ontology) {
  const snapshots = ontology.query({ type: 'RankSnapshot' })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const snapshot = snapshots[0] || null;
  const previous = snapshots[1] || null;
  const prevRank = new Map();
  for (const entry of previous?.ordered || []) {
    if (entry?.project_id != null && entry.rank != null) prevRank.set(entry.project_id, entry.rank);
  }
  const projects = ontology.query({ type: 'Project' });
  const people = ontology.query({ type: 'Person' });
  const events = ontology.query({ type: 'Event' });
  const organizers = ontology.query({ type: 'Organizer' });
  const order = snapshot
    ? snapshot.ordered
    : projects.map((project) => ({
      project_id: project.id,
      score: null,
      reason: null,
      likes: liveLikes(ontology, project.id).length,
      capped: null,
      rank: null,
    }));
  const rows = order.map((entry, index) => {
    const project = projects.find((item) => item.id === entry.project_id);
    if (!project) return null;
    const builders = (project.builder_ids || [])
      .map((id) => people.find((person) => person.id === id))
      .filter(Boolean);
    const event = events.find((item) => item.id === project.event_id) || null;
    const orgs = (project.organizer_ids || [])
      .map((id) => organizers.find((item) => item.id === id))
      .filter(Boolean);
    const rank = entry.rank || index + 1;
    const before = prevRank.get(project.id);
    const delta = before == null ? null : before - rank;
    return {
      rank,
      delta,
      score: entry.score,
      reason: entry.reason,
      likes: liveLikes(ontology, project.id).length,
      capped: entry.capped,
      project,
      builders,
      event,
      organizers: orgs,
    };
  }).filter(Boolean);
  return {
    model: snapshot?.model || null,
    chosen_by: snapshot?.chosen_by || null,
    model_error: snapshot?.model_error ?? null,
    snapshot,
    rows,
  };
}

function latestSnapshot(ontology) {
  return ontology.query({ type: 'RankSnapshot' })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] || null;
}

let snapshotCount = 0;
function snapshotSeq() {
  snapshotCount += 1;
  return snapshotCount;
}

function liveLikes(ontology, projectId) {
  return ontology.query({ type: 'Like' }).filter((row) => row.project_id === projectId && !row.retracted);
}

/** Builders ranked by the summed score of their builds, with movement against the previous snapshot. */
export function presentBuilders(ontology, board = presentBoard(ontology)) {
  const prevScores = new Map();
  const snapshots = ontology.query({ type: 'RankSnapshot' })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  for (const entry of snapshots[1]?.ordered || []) prevScores.set(entry.project_id, Number(entry.score) || 0);
  const byPerson = new Map();
  for (const row of board.rows) {
    for (const person of row.builders) {
      if (!byPerson.has(person.id)) byPerson.set(person.id, { person, builds: [], score: 0, prev: 0, likes: 0 });
      const item = byPerson.get(person.id);
      item.builds.push(row);
      item.score += Number(row.score) || 0;
      item.prev += prevScores.get(row.project.id) ?? (Number(row.score) || 0);
      item.likes += row.likes;
    }
  }
  const order = (key) => [...byPerson.values()]
    .sort((a, b) => b[key] - a[key] || String(a.person.display_name).localeCompare(String(b.person.display_name)));
  const prevRank = new Map(order('prev').map((item, index) => [item.person.id, index + 1]));
  const rows = order('score');
  const top = rows[0]?.score || 1;
  return rows.map((item, index) => {
    const rank = index + 1;
    const best = [...item.builds].sort((a, b) => a.rank - b.rank)[0] || null;
    return {
      ...item,
      rank,
      top,
      best,
      delta: snapshots[1] ? prevRank.get(item.person.id) - rank : null,
    };
  });
}
