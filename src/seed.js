import fs from 'node:fs';
import path from 'node:path';
import { seedFilePath, storeSeedPath } from './paths.js';
import { slug } from './slug.js';
import { ensureProjectThumb, thumbAbsoluteUrl, thumbFileName } from './thumb.js';

/**
 * When the agent-store seed grows, copy it into data/ so the committed tree
 * and offline demo stay in lockstep.
 */
export function syncSeedFromStore() {
  const store = storeSeedPath();
  const dest = seedFilePath();
  if (!fs.existsSync(store)) return { synced: false, path: dest };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(store, dest);
  return { synced: true, path: dest, from: store };
}

/**
 * Load the verified hackathon seed. No other rows.
 * A missing value stays null. An empty organizer list stays empty.
 */
export function readSeedDocument(file = seedFilePath()) {
  syncSeedFromStore();
  const target = fs.existsSync(file) ? file : seedFilePath();
  if (!fs.existsSync(target)) return null;
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file must be a JSON array. Keys: ${Object.keys(parsed).join(', ')}`);
  }
  return parsed;
}

/**
 * Stable unique Project id from a seed row. Same title twice (different
 * Devpost pages) must not collide — fall back to the source_url slug.
 */
export function projectIdForSeedRow(row, taken = new Set()) {
  const base = slug(row?.title || row?.source_url || 'untitled');
  let candidate = `prj_${base}`;
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  const urlTail = String(row?.source_url || '')
    .split('/')
    .filter(Boolean)
    .pop();
  const fromUrl = slug(urlTail || '');
  if (fromUrl && fromUrl !== base) {
    candidate = `prj_${fromUrl}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  let n = 2;
  while (taken.has(`prj_${base}-${n}`)) n += 1;
  candidate = `prj_${base}-${n}`;
  taken.add(candidate);
  return candidate;
}

export async function seedOntology(ontology, doc = readSeedDocument()) {
  if (!doc) return { missing: true, projects: 0, people: 0, events: 0, organizers: 0 };
  const seenPeople = new Set();
  const seenEvents = new Set();
  const seenOrgs = new Set();
  const seenProjectIds = new Set();
  let projects = 0;

  for (const row of doc) {
    const hackathon = empty(row.hackathon);
    const year = row.year ?? null;
    let eventId = null;
    if (hackathon) {
      eventId = `evt_${slug(hackathon)}`;
      if (!seenEvents.has(eventId)) {
        ontology.write({
          type: 'Event',
          id: eventId,
          title: hackathon,
          year,
          starts_at: null,
          ends_at: null,
          city: null,
          luma_url: null,
        });
        seenEvents.add(eventId);
      }
    }

    const organizerNames = Array.isArray(row.organizers) ? row.organizers.filter(Boolean) : null;
    const organizerIds = [];
    for (const name of organizerNames || []) {
      const id = `org_${slug(name)}`;
      if (!seenOrgs.has(id)) {
        ontology.write({
          type: 'Organizer',
          id,
          name,
          person_id: null,
          event_id: eventId,
        });
        seenOrgs.add(id);
      }
      organizerIds.push(id);
    }

    const builderIds = [];
    for (const builder of Array.isArray(row.builders) ? row.builders : []) {
      const name = empty(builder?.name);
      if (!name) continue;
      const id = `per_${slug(name)}`;
      if (!seenPeople.has(id)) {
        ontology.write({
          type: 'Person',
          id,
          discord_id: null,
          display_name: name,
          pseudonym: null,
          socials: Array.isArray(builder.socials) ? builder.socials : null,
          github: null,
          x: null,
          skills: null,
          looking_for: null,
        });
        seenPeople.add(id);
      }
      builderIds.push(id);
    }

    const title = empty(row.title);
    const id = projectIdForSeedRow(row, seenProjectIds);
    const people = builderIds
      .map((pid) => ontology.query({ type: 'Person' }).find((p) => p.id === pid))
      .filter(Boolean);
    const projectDraft = {
      id,
      title,
      one_liner: empty(row.one_liner),
      hackathon,
    };
    const thumb = await ensureProjectThumb(projectDraft, people);
    ontology.write({
      type: 'Project',
      id,
      title,
      one_liner: empty(row.one_liner),
      year,
      hackathon,
      event_id: eventId,
      builder_ids: builderIds,
      organizer_ids: organizerIds,
      organizers: organizerNames,
      source_url: empty(row.source_url),
      demo_url: row.demo_url ?? null,
      repo_url: row.repo_url ?? null,
      urls: [row.demo_url, row.repo_url, row.source_url].filter(Boolean),
      image_path: thumb.image_path || `public/thumbs/${thumbFileName(id)}`,
      thumbnail_url: thumb.thumbnail_url || thumbAbsoluteUrl(id),
    });
    projects += 1;
  }

  return {
    missing: false,
    projects,
    people: seenPeople.size,
    events: seenEvents.size,
    organizers: seenOrgs.size,
  };
}

function empty(value) {
  if (value === undefined || value === null || value === '') return null;
  return value;
}
