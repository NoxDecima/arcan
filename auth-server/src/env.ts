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
};
