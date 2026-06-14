function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalEmpty(name: string): string {
  return process.env[name] ?? "";
}

export const env = {
  /** Better Auth's symmetric secret. Used to sign session cookies. */
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  /** Public URL the BA endpoints are reachable at, e.g. https://chat.example/api/auth */
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  /** SQLite file path. e.g. file:/data/auth.sqlite */
  DATABASE_URL: optional("DATABASE_URL", "file:./auth.sqlite"),
  /** HTTP port */
  PORT: parseInt(optional("PORT", "4300"), 10),
  /** Rate limit: max attempts per window per IP+email */
  AUTH_RATE_LIMIT_MAX: parseInt(optional("AUTH_RATE_LIMIT_MAX", "5"), 10),
  /** Rate limit: window in seconds */
  AUTH_RATE_LIMIT_WINDOW: parseInt(optional("AUTH_RATE_LIMIT_WINDOW", "900"), 10),
  /** Linear personal API token (server-side only). Empty disables the
   *  in-app feedback route — the rest of the api still boots. */
  LINEAR_API_TOKEN: optionalEmpty("LINEAR_API_TOKEN"),
  /** Linear team UUID (Nox). */
  LINEAR_TEAM_ID: optional("LINEAR_TEAM_ID", "8f04cf65-d7a9-41d3-bc9b-5074f744e850"),
  /** Linear project UUID (Arcan). */
  LINEAR_PROJECT_ID: optional("LINEAR_PROJECT_ID", "79d46a12-7563-4e3c-833b-d49531d94bb1"),
  /** Linear label UUID for the 'Feedback' tag. */
  LINEAR_LABEL_FEEDBACK_ID: optional("LINEAR_LABEL_FEEDBACK_ID", "e4c59d7f-2ebb-4ea0-bc37-f4e863b5a694"),
  /** Linear label UUID for the optional category 'Bug'. */
  LINEAR_LABEL_BUG_ID: optional("LINEAR_LABEL_BUG_ID", "c8272cda-3f22-4850-b267-d166b844f770"),
  /** Linear label UUID for the optional category 'Idea' (formerly 'Improvement'; UUID preserved). */
  LINEAR_LABEL_IDEA_ID: optional("LINEAR_LABEL_IDEA_ID", "9c75086b-59b9-4f61-b0d4-525932b42231"),
  /** Linear label UUID for the optional category 'Question'. */
  LINEAR_LABEL_QUESTION_ID: optional("LINEAR_LABEL_QUESTION_ID", "25b14de5-b5b7-4beb-8cbd-a41fe26e21de"),
  /** Linear label UUID for the optional category 'Note'. */
  LINEAR_LABEL_NOTE_ID: optional("LINEAR_LABEL_NOTE_ID", "724e389c-84ec-450a-9165-a11e6639a984"),
  /** Max combined attachment bytes per feedback submission. */
  FEEDBACK_MAX_TOTAL_BYTES: parseInt(optional("FEEDBACK_MAX_TOTAL_BYTES", String(10 * 1024 * 1024)), 10),
  /** Feedback per-account rate limit: max submissions per window. */
  FEEDBACK_RATE_LIMIT_MAX: parseInt(optional("FEEDBACK_RATE_LIMIT_MAX", "10"), 10),
  /** Feedback rate limit window in seconds (default 1h). */
  FEEDBACK_RATE_LIMIT_WINDOW: parseInt(optional("FEEDBACK_RATE_LIMIT_WINDOW", "3600"), 10),
};
