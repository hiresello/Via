/**
 * Pin microsoft/microsoft-decision-1. It is text → decisions, not chat.
 * POST /api/v1/systemone with { model, state, questions }.
 * Answers are calibrated probabilities over the options we sent.
 * A 404 tries the alpha decisions route once, then stays on stub.
 * Do not substitute another model.
 */
export const OPENROUTER_MODEL = 'microsoft/microsoft-decision-1';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/systemone';
export const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/v1/api/alpha/decisions';

/** Host and .env both count. Whitespace and a blank assignment do not. */
export function hasOpenRouterKey() {
  return Boolean(openRouterKey());
}

/** The raw key: trims, drops wrapping quotes and a pasted `Bearer ` prefix. */
export function openRouterKey() {
  return String(process.env.OPENROUTER_API_KEY || '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

/** Questions are a map of id → question. An array is rejected by System One. */
export function isQuestionRecord(questions) {
  return Boolean(questions) && typeof questions === 'object' && !Array.isArray(questions);
}

const DECISION_TIMEOUT_MS = 45_000;

export async function decide({ state, questions, fetchImpl = fetch }) {
  const key = openRouterKey();
  if (!key) {
    return {
      model: 'stub',
      answers: null,
      skipped: 'no OPENROUTER_API_KEY',
      rejected: null,
      error: 'no OPENROUTER_API_KEY',
    };
  }
  if (!isQuestionRecord(questions)) {
    return {
      model: 'stub',
      answers: null,
      skipped: null,
      rejected: null,
      error: 'questions must be a record',
    };
  }
  const primary = await postDecision(OPENROUTER_URL, { state, questions, key, fetchImpl });
  if (primary.notFound) {
    const fallback = await postDecision(OPENROUTER_DECISIONS_URL, { state, questions, key, fetchImpl });
    if (fallback.notFound) {
      return {
        model: 'stub',
        answers: null,
        skipped: null,
        rejected: 'microsoft/microsoft-decision-1 was rejected (404)',
      };
    }
    return fallback.result;
  }
  return primary.result;
}

function redact(message) {
  const key = openRouterKey();
  let text = String(message || 'OpenRouter request failed');
  if (key) text = text.split(key).join('[redacted]');
  return text.slice(0, 300);
}

async function postDecision(url, { state, questions, key, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VIA_PUBLIC_URL || 'http://localhost:8787',
        'X-Title': 'Via',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        state,
        questions,
      }),
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    const message = timedOut
      ? `OpenRouter timed out after ${DECISION_TIMEOUT_MS}ms`
      : redact(error?.message);
    return {
      notFound: false,
      result: { model: 'stub', answers: null, skipped: null, rejected: null, error: message },
    };
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (response.status === 404) return { notFound: true, result: null };
  if (!response.ok) {
    return {
      notFound: false,
      result: {
        model: 'stub',
        answers: null,
        skipped: null,
        rejected: null,
        error: redact(`OpenRouter ${response.status}: ${text.slice(0, 300)}`),
      },
    };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      notFound: false,
      result: { model: 'stub', answers: null, error: 'OpenRouter returned non-JSON', rejected: null, skipped: null },
    };
  }
  const reported = body.model || OPENROUTER_MODEL;
  if (!String(reported).includes('microsoft-decision-1')) {
    return {
      notFound: false,
      result: {
        model: 'stub',
        answers: null,
        rejected: `OpenRouter answered as ${reported}, not microsoft/microsoft-decision-1`,
        skipped: null,
      },
    };
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return {
      notFound: false,
      result: {
        model: 'stub',
        answers: null,
        error: 'microsoft/microsoft-decision-1 returned no answers',
        rejected: null,
        skipped: null,
      },
    };
  }
  return {
    notFound: false,
    result: { model: OPENROUTER_MODEL, answers: body.answers, skipped: null, rejected: null },
  };
}
