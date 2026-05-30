/**
 * Run Better Auth migrations against the auth-server's configured DB.
 *
 * Used by Playwright e2e (via scripts/auth-server-with-migrate.sh) and the
 * production Docker entrypoint (see deploy/Dockerfile.auth) to make sure
 * the user / session / verification / account tables exist before any
 * sign-up request lands.
 *
 * Why: Better Auth declares schema in code via plugin.schema, but does
 * NOT auto-create the tables on server boot. The official path is
 * `getMigrations(config).runMigrations()` (or the @better-auth/cli wrapper)
 * as a discrete ops step. We bake it into the boot script so dev / CI /
 * production all stay in sync.
 *
 * Expects to be run from the repo root (or with the auth-server installed
 * as a sibling at ./auth-server).
 */
import { getMigrations } from "better-auth/db/migration";
import { createDatabase } from "../auth-server/src/db.ts";
import { jazzZkPlugin } from "../auth-server/src/plugin.ts";

const db = createDatabase();
const config = {
  database: db,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
  },
  plugins: [jazzZkPlugin()],
};

const { runMigrations } = await getMigrations(config);
await runMigrations();
console.log("auth-server migrations applied");
db.close();
