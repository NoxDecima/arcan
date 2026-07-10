import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { createDatabase } from "./db.js";
import { jazzZkPlugin } from "./plugin.js";
import { LinearClient } from "./linear-client.js";
import { registerFeedbackRoute } from "./feedback-route.js";
import { SHELL_ORIGINS } from "./shell-origins.js";

const db = createDatabase();

const authConfig = {
  database: db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: SHELL_ORIGINS,
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
  // Reject raw session tokens — only the signed token from set-auth-token authenticates.
  plugins: [jazzZkPlugin(), bearer({ requireSignature: true })],
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

app.use(
  "/api/*",
  cors({
    origin: SHELL_ORIGINS,
    allowHeaders: ["content-type", "authorization", "x-jazz-zk"],
    exposeHeaders: ["set-auth-token"],
    maxAge: 86400,
  }),
);

// Better Auth exposes `auth.handler(request)` — wire it under /api/auth/*
app.all("/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

if (env.LINEAR_API_TOKEN) {
  const linearClient = new LinearClient({
    apiToken: env.LINEAR_API_TOKEN,
    teamId: env.LINEAR_TEAM_ID,
    projectId: env.LINEAR_PROJECT_ID,
  });

  registerFeedbackRoute(app, {
    auth,
    linearClient,
    feedbackLabelId: env.LINEAR_LABEL_FEEDBACK_ID,
    categoryLabels: {
      Bug: env.LINEAR_LABEL_BUG_ID,
      Idea: env.LINEAR_LABEL_IDEA_ID,
      Question: env.LINEAR_LABEL_QUESTION_ID,
      Note: env.LINEAR_LABEL_NOTE_ID,
    },
    maxTotalBytes: env.FEEDBACK_MAX_TOTAL_BYTES,
    rateLimiterMax: env.FEEDBACK_RATE_LIMIT_MAX,
    rateLimiterWindowSeconds: env.FEEDBACK_RATE_LIMIT_WINDOW,
  });
} else {
  console.warn("api: LINEAR_API_TOKEN not set — feedback route disabled");
}

// Health check
app.get("/health", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT }, ({ port }: { port: number }) => {
  console.log(`api service listening on :${port}`);
});
