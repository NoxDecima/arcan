import { betterAuth } from "better-auth";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { createDatabase } from "./db.js";
import { jazzZkPlugin } from "./plugin.js";

const db = createDatabase();

export const auth = betterAuth({
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
});

const app = new Hono();

// Better Auth exposes `auth.handler(request)` — wire it under /api/auth/*
app.all("/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Health check
app.get("/health", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT }, ({ port }: { port: number }) => {
  console.log(`auth-server listening on :${port}`);
});
