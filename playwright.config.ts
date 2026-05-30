import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run sync",
      port: 4200,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Auth-server for Slice 7 e2e specs. Better Auth requires BETTER_AUTH_SECRET
      // (any 32+ byte string is fine for tests). The dev SQLite DB lives at
      // auth-server/auth.sqlite — wipe between runs if you hit uniqueness
      // collisions on email/username (helpers.freshCredentials() should prevent
      // that, but the file accumulates over time).
      // Rate limit raised so the e2e sweep doesn't trip on repeated failed
      // attempts during invalid-credentials / change-password specs.
      command:
        "BETTER_AUTH_SECRET=test-secret-for-e2e-only-not-prod-xyz BETTER_AUTH_URL=http://localhost:5173/api/auth PORT=4300 AUTH_RATE_LIMIT_MAX=1000 AUTH_RATE_LIMIT_WINDOW=60 ./scripts/auth-server-with-migrate.sh",
      port: 4300,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
