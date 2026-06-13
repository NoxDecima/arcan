import { describe, test, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import { jazzZkPlugin } from "../src/plugin.js";
import { registerFeedbackRoute } from "../src/feedback-route.js";
import { LinearClient } from "../src/linear-client.js";

async function makeAuthAndApp() {
  const db = new Database(":memory:");
  const config = {
    database: db,
    secret: "test-secret-test-secret-test-secret-test",
    baseURL: "http://localhost/api/auth",
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    plugins: [jazzZkPlugin()],
  };
  await (await getMigrations(config)).runMigrations();
  const auth = betterAuth(config);

  const linearClient = {
    createIssue: vi.fn(),
    uploadFile: vi.fn(),
  } as unknown as LinearClient;

  const app = new Hono();
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  registerFeedbackRoute(app, {
    auth,
    linearClient,
    feedbackLabelId: "feedback-label-uuid",
    categoryLabels: {
      Bug: "bug-label-uuid",
      Idea: "idea-label-uuid",
      Question: "question-label-uuid",
      Note: "note-label-uuid",
    },
    maxTotalBytes: 10 * 1024 * 1024,
    rateLimiterMax: 10,
    rateLimiterWindowSeconds: 3600,
  });

  return { app, auth, linearClient };
}

async function signUpAndGetCookie(auth: Awaited<ReturnType<typeof betterAuth>>) {
  const res = await auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-zk": JSON.stringify({
          kdfSalt: Buffer.from("salt-of-32-bytes-aaaaaaaaaaaaaaa").toString("base64"),
          encryptedSeed: Buffer.from("encrypted-seed-blob-aaaaaaaaaaaa").toString("base64"),
          recoveryProofHmac: Buffer.from("hmac-of-32-bytes-aaaaaaaaaaaaaa").toString("base64"),
          accountID: "co_zTEST",
        }),
      },
      body: JSON.stringify({
        email: "alice@example.test",
        password: "correcthorsebattery1",
        name: "Alice",
      }),
    })
  );
  expect(res.status).toBeLessThan(400);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("happy path: text-only message creates an issue with the verified email", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);

    (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "issue-id-1",
      identifier: "NOX-101",
      url: "https://linear.app/nox/issue/NOX-101",
    });

    const body = new FormData();
    body.set("message", "The button doesn't work on Safari.");
    body.set("category", "Bug");

    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      issue: { identifier: "NOX-101", url: "https://linear.app/nox/issue/NOX-101" },
    });

    expect(linearClient.createIssue).toHaveBeenCalledOnce();
    const arg = (linearClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.title).toContain("The button doesn't work on Safari");
    expect(arg.description).toContain("alice@example.test");
    expect(arg.description).toContain("The button doesn't work on Safari.");
    expect(arg.labelIds).toEqual(expect.arrayContaining(["feedback-label-uuid", "bug-label-uuid"]));
  });

  test("rejects unauthenticated requests with 401", async () => {
    const { app } = await makeAuthAndApp();

    const body = new FormData();
    body.set("message", "Hello");

    const res = await app.request("/api/feedback", { method: "POST", body });
    expect(res.status).toBe(401);
  });

  test("rejects empty message with 400", async () => {
    const { app, auth } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);
    const body = new FormData();
    body.set("message", "");
    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(400);
  });

  test("uploads attachments to Linear and embeds asset URLs in the description", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);

    (linearClient.uploadFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ assetUrl: "https://uploads.linear.app/asset/a.png" })
      .mockResolvedValueOnce({ assetUrl: "https://uploads.linear.app/asset/b.log" });
    (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "id-2",
      identifier: "NOX-102",
      url: "https://linear.app/nox/issue/NOX-102",
    });

    const png = new File([new Uint8Array([1, 2, 3])], "screenshot.png", {
      type: "image/png",
    });
    const log = new File([new Uint8Array([10, 20])], "debug.log", {
      type: "text/plain",
    });

    const body = new FormData();
    body.set("message", "Two attachments");
    body.append("attachment", png);
    body.append("attachment", log);

    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });

    expect(res.status).toBe(200);
    expect(linearClient.uploadFile).toHaveBeenCalledTimes(2);
    expect(linearClient.createIssue).toHaveBeenCalledOnce();

    const issueArg = (linearClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(issueArg.description).toContain("https://uploads.linear.app/asset/a.png");
    expect(issueArg.description).toContain("https://uploads.linear.app/asset/b.log");
    expect(issueArg.description).toContain("screenshot.png");
    expect(issueArg.description).toContain("debug.log");
  });

  test("rejects when combined attachment size exceeds the cap", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);

    // 11 MB > 10 MB cap
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.bin", {
      type: "application/octet-stream",
    });
    const body = new FormData();
    body.set("message", "Too big");
    body.append("attachment", big);

    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(413);
    expect(linearClient.uploadFile).not.toHaveBeenCalled();
    expect(linearClient.createIssue).not.toHaveBeenCalled();
  });

  test("rate-limited after FEEDBACK_RATE_LIMIT_MAX submissions", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);
    (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "x",
      identifier: "NOX-999",
      url: "u",
    });
    // make 10 calls — all succeed, 11th is rate-limited
    for (let i = 0; i < 10; i++) {
      const body = new FormData();
      body.set("message", `call ${i}`);
      const res = await app.request("/api/feedback", {
        method: "POST",
        headers: { cookie },
        body,
      });
      expect(res.status).toBe(200);
    }
    const body = new FormData();
    body.set("message", "limited");
    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(429);
  });

  test("Idea category maps to the Idea label", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);

    (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "id-idea",
      identifier: "NOX-200",
      url: "https://linear.app/nox/issue/NOX-200",
    });

    const body = new FormData();
    body.set("message", "Could we add tag filters in the chat list?");
    body.set("category", "Idea");

    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });

    expect(res.status).toBe(200);
    const arg = (linearClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.labelIds).toEqual(
      expect.arrayContaining(["feedback-label-uuid", "idea-label-uuid"])
    );
  });
});
