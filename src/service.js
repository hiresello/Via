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
    // A successful System One score for this signature is the only durable hit.
    // A stub from a missing-key boot, or one written with model_error, is this
    // response's fallback — the next request retries while the key is set.
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

export async function submitProject(ontology, input, opts = {}) {
  const title = input.title && String(input.title).trim();
  if (!title) throw new Error('title is required');
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
