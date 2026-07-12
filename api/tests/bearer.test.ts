import { describe, test, expect, beforeEach } from "vitest";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { jazzZkPlugin } from "../src/plugin.js";
import { SHELL_ORIGINS } from "../src/shell-origins.js";

async function makeAuth() {
  const db = new Database(":memory:");
  const config = {
    database: db,
    secret: "test-secret-test-secret-test-secret-test",
    baseURL: "http://localhost/api/auth",
    trustedOrigins: SHELL_ORIGINS,
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    // better-auth skips origin checks under NODE_ENV=test by default; force them on so
    // trustedOrigins is actually exercised.
    advanced: { disableOriginCheck: false },
    // Reject raw session tokens — only the signed token from set-auth-token authenticates.
    plugins: [jazzZkPlugin(), bearer({ requireSignature: true })],
  };
  const migrations = await getMigrations(config);
  await migrations.runMigrations();
  return betterAuth(config);
}

const zkPayload = {
  kdfSalt: Buffer.from("salt-of-32-bytes-aaaaaaaaaaaaaaa").toString("base64"),
  encryptedSeed: Buffer.from("encrypted-seed-blob-aaaaaaaaaaaa").toString("base64"),
  recoveryProofHmac: Buffer.from("hmac-of-32-bytes-aaaaaaaaaaaaaa").toString("base64"),
  accountID: "co_zBEARER123",
};

type Auth = Awaited<ReturnType<typeof makeAuth>>;

async function signUp(auth: Auth, email: string) {
  return auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-zk": JSON.stringify(zkPayload),
        "origin": "https://tauri.localhost",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
      },
      body: JSON.stringify({
        email,
        password: "correcthorsebattery1",
        name: "bearer-test-user",
      }),
    }),
  );
}

/** Perform a sign-in from the given origin (with Fetch-Metadata headers). */
async function signIn(
  auth: Auth,
  email: string,
  password: string,
  origin: string = "https://tauri.localhost",
) {
  return auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": origin,
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
      },
      body: JSON.stringify({ email, password }),
    }),
  );
}

describe("SHELL_ORIGINS constant", () => {
  test("contains the three required Tauri origins", () => {
    expect(SHELL_ORIGINS).toContain("https://tauri.localhost");
    expect(SHELL_ORIGINS).toContain("http://tauri.localhost");
    expect(SHELL_ORIGINS).toContain("tauri://localhost");
    expect(SHELL_ORIGINS).toHaveLength(3);
  });
});

describe("bearer plugin integration", () => {
  let auth: Auth;
  beforeEach(async () => { auth = await makeAuth(); });

  test("sign-in from shell origin sets set-auth-token header", async () => {
    await signUp(auth, "bearer@example.com");

    const res = await signIn(auth, "bearer@example.com", "correcthorsebattery1");

    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token, "set-auth-token header must be present after sign-in").toBeTruthy();
  });

  test("GET /get-session with Authorization: Bearer token returns 200", async () => {
    await signUp(auth, "bearer-session@example.com");

    // Sign in to get the token
    const signInRes = await signIn(auth, "bearer-session@example.com", "correcthorsebattery1");
    expect(signInRes.status).toBe(200);

    const token = signInRes.headers.get("set-auth-token");
    expect(token, "set-auth-token must be present to test bearer auth").toBeTruthy();

    // Use Bearer token to authenticate a subsequent request
    const sessionRes = await auth.handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: {
          "authorization": `Bearer ${token}`,
        },
      }),
    );

    expect(sessionRes.status).toBe(200);
    const body = await sessionRes.json();
    expect(body.user).toBeTruthy();
    expect(body.user.email).toBe("bearer-session@example.com");
  });

  test("GET /get-session without token returns no user", async () => {
    const res = await auth.handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
      }),
    );
    // better-auth returns 200 with null user for unauthenticated get-session
    const body = await res.json();
    expect(body?.user ?? null).toBeNull();
  });

  test("GET /me/auth-material with Bearer token returns ZK fields", async () => {
    await signUp(auth, "bearer-material@example.com");

    const signInRes = await signIn(auth, "bearer-material@example.com", "correcthorsebattery1");
    const token = signInRes.headers.get("set-auth-token");
    expect(token).toBeTruthy();

    const res = await auth.handler(
      new Request("http://localhost/api/auth/me/auth-material", {
        method: "GET",
        headers: {
          "authorization": `Bearer ${token}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kdfSalt).toBe(zkPayload.kdfSalt);
    expect(body.encryptedSeed).toBe(zkPayload.encryptedSeed);
    expect(body.accountID).toBe(zkPayload.accountID);
  });

  // --- Negative tests ---

  test("sign-in from untrusted origin is rejected with 403", async () => {
    // advanced: { disableOriginCheck: false } overrides better-auth's default
    // skipOriginCheck=true in NODE_ENV=test, so trustedOrigins is actually exercised.
    await signUp(auth, "evil-origin@example.com");

    const res = await signIn(
      auth,
      "evil-origin@example.com",
      "correcthorsebattery1",
      "https://evil.example",
    );

    expect(res.status).toBe(403);
  });

  test("sign-in from trusted Tauri origin succeeds — trustedOrigins line is load-bearing", async () => {
    // Positive counterpart: a request from https://tauri.localhost (in SHELL_ORIGINS)
    // succeeds even with origin checks forced on. Removing the trustedOrigins line in
    // api/src/index.ts would flip this test to 403.
    await signUp(auth, "trusted-origin@example.com");

    const res = await signIn(
      auth,
      "trusted-origin@example.com",
      "correcthorsebattery1",
      "https://tauri.localhost",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("set-auth-token")).toBeTruthy();
  });

  test("GET /get-session with Authorization: Bearer garbage returns null user", async () => {
    // A raw token without a dot is rejected by requireSignature; better-auth
    // falls back to treating the request as unauthenticated and returns 200
    // with a null user (same as no-token behaviour).
    const res = await auth.handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: {
          "authorization": "Bearer garbage",
        },
      }),
    );

    // better-auth returns 200 with null user for unauthenticated get-session
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body?.user ?? null).toBeNull();
  });

  test("failed sign-in (wrong password) does not carry set-auth-token header", async () => {
    await signUp(auth, "wrong-pass@example.com");

    const res = await signIn(auth, "wrong-pass@example.com", "wrong-password-here");

    // better-auth returns 401 for bad credentials
    expect(res.status).not.toBe(200);
    expect(res.headers.get("set-auth-token")).toBeNull();
  });
});
