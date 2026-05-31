/**
 * Production migration runner — invoked at container start (see Dockerfile.auth).
 *
 * Better Auth declares its schema in code via the plugin contract but does not
 * auto-create tables on server boot. This script calls
 * getMigrations(config).runMigrations() once before the server starts listening,
 * so the user / session / account / verification tables exist for the first
 * sign-up request.
 *
 * Imports the compiled JS (./dist/...) so this works in the alpine runtime
 * stage without tsx; the dev-side equivalent (scripts/migrate-auth-server.mjs)
 * imports the .ts sources via tsx instead.
 */
import { getMigrations } from "better-auth/db/migration";
import { createDatabase } from "./dist/db.js";
import { jazzZkPlugin } from "./dist/plugin.js";

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
