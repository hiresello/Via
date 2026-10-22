import { decide, OPENROUTER_MODEL } from './decision.js';

/**
 * Plan §10 relevance stack. System One scores each project against these
 * levels. The stub applies the same caps. No second rubric.
 */
export const RANK_INSTRUCTIONS = `Score the live slate only. Unknown fields stay empty — do not invent users, revenue, owners, or a backstory. Event name and organizer tags are labels, not weights. Order projects; keep the owner of the hard part attached as the talent line. Do not emit a people-graph, a fundability score, or a production-readiness score.

Weight UP — hackathon-native signal only.

- In-window delta. Signal: commits, demo, or description showing the working slice was made inside this event’s clock; a pre-existing product counts only for what changed at the event. Why it is evidence: compression is the hackathon’s unique fact; without a clock the object is a startup shown at a booth. Use: cap anything whose scope is not believable in the window; a coat-of-paint delta scores near the floor.

- One runnable path. Signal: a URL, repo path, or recording where a named input produces a named outcome a stranger can follow. Why it is evidence: the sample is pokeable mechanism; a promise has no hackathon-specific value. Use: no traceable path → hard cap, whatever the likes or the prize. An architecture diagram is not a path.

- Hard part finished. Signal: the risky piece (integration, model behavior, hardware, data, latency, a nasty edge) is what the demo actually does; the shell around it is thin. Why it is evidence: under a shared cutoff, judgment is which piece you refused to fake. Use: up-rank a narrow demo whose center is the mechanism; a mocked, stubbed, or “TODO” core is costume.

- Load-bearing constraint. Signal: one concrete limit (theme, API quirk, dataset, hardware, venue, regulation, a real operator’s step) and a design consequence you can point at. Why it is evidence: the default build ignores the brief; the information is how the brief pushed back. Use: reward a solution that only makes sense because of that limit. Sponsor technology that does no work in the path is not a constraint.

- Nameable move. Signal: one sentence a peer could disagree with — the deviation from the template everyone else could have shipped — visible in the path. Why it is evidence: the bar is a specific difference you can see working, and that sentence is the whole claim. Use: if the submission contains no move, do not invent one; absence caps the score. A chat box on a generic API is not a move.

- Named owner of the hard part. Signal: which builder pushed the mechanism, the integration, or the overnight fix — the person on the hard slice, separate from who spoke on stage. Why it is evidence: recruiters are reading who pushed; builders are reading what pushing looks like. Use: attach that name to the rank line. “The team” with no owner is weaker evidence of the same build. Silence on ownership stays blank. Title, school, and employer stay unused.

- Specific scar. Signal: a stated boundary — input class that fails, scope cut on purpose, live break and the fix. Why it is evidence: a weekend system is partial; naming the edge is how a stranger knows the path is real. Use: specific limits raise trust in the path. The scar is a feature of the evidence.

- Artifact that outlives the room. Signal: repo, runnable demo, or recording that still shows the path with no founder present. Why it is evidence: the community value is memory that survives the Sunday Discord dump. Use: prefer the artifact a stranger can reopen. Tests, CI, and a production deploy are not required.

- Reasoned community likes. Signal: Ontology likes on this project, typed when present (want_to_join above cool_idea above a bare like). Why it is evidence: a like is conviction that this build cleared someone’s bar — not reach. Use: likes reorder projects that already clear path, clock, and hard part, and they break ties. They do not lift a capped project over an uncapped one. Zero likes is a legal state (new post, small room), not a zero score. Mutuals, roles, and account age stay unused.

- Sharper than their last build. Signal: prior Ontology projects by the same builders where this one has a tighter path, a harder constraint, or cleaner ownership. Why it is evidence: the community thesis is judgment that compounds across events. Use: apply only when that history exists. No history is neutral.

Weight DOWN — looks like quality; wrong objective. Add nothing for each.

- Visual polish. Fidelity, motion, brand, landing-page craft. Usual place an unfinished core hides.
- Deck and demo charisma. Narrative, slide craft, stage smoothness. Predicts who presents, not what got built.
- Revenue and traction theater. MRR, waitlists, user counts, customer logos. A weekend does not produce honest revenue; displayed numbers are costume.
- Production-readiness. Test suites, CI, auth completeness, “scalable architecture.” That objective is a company. The scar is the honest substitute.
- Reach. Followers, GitHub stars, LinkedIn, Discord status, press. Attention graph, not conviction about this build.
- Sponsor and “powered by” walls. Logos that are not the load-bearing constraint. Booth capture.
- Prize and judge placement. Organizer rubrics overweight pitch and sponsor fit. Via’s bar may disagree with the trophy. Placement is not a score.
- Feature count. More screens, more modes, more integrations-as-checklist. Surface area usually thins the hard part. The single deep path is the evidence.
- Startup shape. Market size, fundraising, “would fund,” company potential. Out of objective. Do not infer a company.
- Pedigree. School, employer, ex-company, job title. Not evidence under this clock.
- Generic model wrapper. “Uses AI” with no constraint-shaped behavior. Presence of a model adds nothing.
- Volume. README length, commit count, dependency count, slide count. Noise. Timestamps matter only as clock evidence.

Objective. Rank by how clearly a stranger can see a real slice finished under this event’s clock, who pushed the hard part, and which constraint forced the shape; community likes adjust conviction and never replace that evidence.`;

export const REASON_CRITERIA = {
  path: 'A stranger can open one path and follow input to outcome.',
  clock: 'The slice is on this event’s clock, not a booth for an older product.',
  hard: 'The hard part is what works. The shell around it is thin.',
  constraint: 'A concrete limit forced the shape.',
  owner: 'Named builders are on the card. Who pushed the hard part stays blank unless the record names them.',
  peers: 'Peers marked conviction. Likes moved it only because path, clock, and hard part already clear.',
  cap: 'Missing a runnable path, the event clock, or a finished core. Likes cannot lift it to the top.',
};

/** Ordered score levels sent to System One. Index 0 is the floor. */
export const SCORE_LEVELS = [
  'Hard cap. No runnable path, no event clock, or a mocked core. Likes cannot lift this.',
  'A path exists. The hard part is thin or the constraint is generic.',
  'One runnable path on this event clock. A stranger can follow input to outcome.',
  'The hard part is what the demo does, a concrete limit forced the shape, and the owner of that part is named.',
  'An artifact still shows the path, and peer likes are conviction on a build that already clears the cap.',
];

/** Capped projects sit at or below this. Clearing projects start above it. */
export const CAP = 39;
const LIKE_UNIT = 5;
const SIGNAL_WEIGHT = { want_to_join: 3, cool_idea: 2, like: 1 };

export function hasRunnablePath(project) {
  return Boolean(project.demo_url || project.repo_url);
}

export function hasEventClock(project) {
  return Boolean(project.hackathon && project.year != null);
}

export function coreIsMocked(project) {
  const text = `${project.title || ''} ${project.one_liner || ''}`;
  return /\b(todo|mocked|mock|stubbed|placeholder|coming soon)\b/i.test(text);
}

export function conviction(likes) {
  return likes.reduce((sum, like) => sum + (SIGNAL_WEIGHT[like.signal] || SIGNAL_WEIGHT.like), 0);
}

/**
 * Same caps the prompt states. Missing path, clock, or a mocked core:
 * likes do not add, and the score cannot clear CAP.
 */
export function scoreProject(project, { likes = [], priors = 0 } = {}) {
  const path = hasRunnablePath(project);
  const clock = hasEventClock(project);
  const mocked = coreIsMocked(project);
  const capped = !path || !clock || mocked;
  let evidence = 8;
  if (project.demo_url) evidence += 22;
  if (project.repo_url) evidence += 14;
  if (clock) evidence += 6;
  if ((project.builder_ids || []).length) evidence += 4;
  evidence += Math.min(8, Math.round(String(project.one_liner || '').length / 28));
  if (priors > 0) evidence += 3;
  const likesIn = conviction(likes);
  let score;
  let reason;
  if (capped) {
    score = Math.min(evidence, CAP);
    reason = REASON_CRITERIA.cap;
  } else {
    score = CAP + 1 + evidence + likesIn * LIKE_UNIT;
    if (likesIn >= 3) reason = REASON_CRITERIA.peers;
    else if (path) reason = REASON_CRITERIA.path;
    else reason = REASON_CRITERIA.hard;
  }
  return { score, reason, capped, path, clock, mocked, likes: likesIn };
}

export async function rankProjects(ontology, projects, opts = {}) {
  const forceStub = opts.forceStub || !process.env.OPENROUTER_API_KEY;
  const likes = ontology.query({ type: 'Like' }).filter((row) => !row.retracted);
  const all = projects.map((project) => ({
    project,
    likes: likes.filter((row) => row.project_id === project.id),
    priors: priorCount(ontology, project),
  }));

  if (forceStub) {
    return finish('stub', 'stub', null, all.map((row) => stubRow(row)));
  }

  try {
    const questions = {};
    for (const row of all) {
      questions[row.project.id] = {
        type: 'score',
        instructions: 'Score this project on the rubric in state.rubric. Use only the card in state. Higher means a stranger can see a real slice finished under this event’s clock.',
        criteria: SCORE_LEVELS,
      };
    }
    const decision = await decide({
      state: {
        rubric: RANK_INSTRUCTIONS,
        projects: all.map((row) => stateFor(row)),
        note: 'Likes are conviction. They reorder only when path, clock, and hard part already clear. Cap any project missing a runnable path, the event clock, or a finished core.',
      },
      questions,
      fetchImpl: opts.fetchImpl,
    });
    if (decision.model !== OPENROUTER_MODEL) {
      const note = decision.rejected || decision.error || decision.skipped || 'microsoft/microsoft-decision-1 unavailable';
      return finish('stub', 'stub', note, all.map((row) => stubRow(row)));
    }
    const parsed = rowsFromAnswers(decision.answers, all);
    if (!parsed) {
      return finish('stub', 'stub', 'microsoft/microsoft-decision-1 returned no scores', all.map((row) => stubRow(row)));
    }
    return finish(OPENROUTER_MODEL, OPENROUTER_MODEL, null, parsed);
  } catch (error) {
    return finish('stub', 'stub', error.message, all.map((row) => stubRow(row)));
  }
}

function finish(model, chosenBy, modelError, rows) {
  rows.sort((a, b) => b.score - a.score || String(a.project_id).localeCompare(String(b.project_id)));
  return {
    model,
    chosen_by: chosenBy,
    model_error: modelError,
    ordered: rows,
  };
}

function stubRow(row) {
  const scored = scoreProject(row.project, row);
  return {
    project_id: row.project.id,
    score: scored.score,
    reason: scored.reason,
    likes: row.likes.length,
    conviction: scored.likes,
    capped: scored.capped,
  };
}

function mapModelScore(answer) {
  if (!answer || answer.type !== 'score' || !Number.isFinite(Number(answer.score))) return null;
  const score = Number(answer.score);
  const top = SCORE_LEVELS.length - 1;
  if (score >= 0 && score <= 1) return Math.round(score * 1000) / 10;
  if (score >= 0 && score <= top) return Math.round((score / top) * 1000) / 10;
  return score;
}

function rowsFromAnswers(answers, all) {
  if (!answers || typeof answers !== 'object') return null;
  let any = false;
  const rows = all.map((row) => {
    const scored = scoreProject(row.project, row);
    const mapped = mapModelScore(answers[row.project.id]);
    if (mapped != null) any = true;
    let score;
    let reason = scored.reason;
    if (scored.capped) {
      score = Math.min(mapped ?? scored.score, CAP);
      reason = REASON_CRITERIA.cap;
    } else if (mapped == null) {
      score = scored.score;
    } else {
      score = Math.max(CAP + 1, mapped) + scored.likes * LIKE_UNIT;
    }
    return {
      project_id: row.project.id,
      score: Math.round(score * 10) / 10,
      reason,
      likes: row.likes.length,
      conviction: scored.likes,
      capped: scored.capped,
    };
  });
  return any ? rows : null;
}

function stateFor(row) {
  const project = row.project;
  return {
    project_id: project.id,
    title: project.title ?? null,
    one_liner: project.one_liner ?? null,
    hackathon: project.hackathon ?? null,
    year: project.year ?? null,
    organizers: project.organizers ?? null,
    demo_url: project.demo_url ?? null,
    repo_url: project.repo_url ?? null,
    source_url: project.source_url ?? null,
    builder_ids: project.builder_ids ?? null,
    hard_part_owner: null,
    likes: row.likes.map((like) => ({ signal: like.signal || 'like' })),
    prior_projects_by_same_builders: row.priors,
  };
}

function priorCount(ontology, project) {
  const ids = new Set(project.builder_ids || []);
  if (!ids.size) return 0;
  return ontology.query({ type: 'Project' }).filter((other) =>
    other.id !== project.id && (other.builder_ids || []).some((id) => ids.has(id)),
  ).length;
}
