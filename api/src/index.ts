import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { createDatabase } from "./db.js";
import { jazzZkPlugin } from "./plugin.js";

const db = createDatabase();

const authConfig = {
  database: db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
  },
  rateLimit: {
    enabled: true,
    window: env.AUTH_RATE_LIMIT_WINDOW,
    max: env.AUTH_RATE_LIMIT_MAX,
  },
  plugins: [jazzZkPlugin()],
};

export const auth = betterAuth(authConfig);

// Better Auth declares schema in code via the plugin contract but does not
// auto-create the user/session/account/verification tables on boot. Run the
// migrations here, in-process, before we start serving. Without this the
// first /sign-up request hits "no such table: user".
//
// Top-level await is fine because this module is ESM ("type": "module" in
// package.json + "module": "ESNext" in tsconfig).
const { runMigrations } = await getMigrations(authConfig);
await runMigrations();
console.log("api service migrations applied");

const app = new Hono();

// Better Auth exposes `auth.handler(request)` — wire it under /api/auth/*
app.all("/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Health check
app.get("/health", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT }, ({ port }: { port: number }) => {
  console.log(`api service listening on :${port}`);
});
