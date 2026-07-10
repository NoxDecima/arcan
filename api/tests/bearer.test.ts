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
    plugins: [jazzZkPlugin(), bearer()],
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
      },
      body: JSON.stringify({
        email,
        password: "correcthorsebattery1",
        name: "bearer-test-user",
      }),
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

    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "https://tauri.localhost",
        },
        body: JSON.stringify({
          email: "bearer@example.com",
          password: "correcthorsebattery1",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token, "set-auth-token header must be present after sign-in").toBeTruthy();
  });

  test("GET /get-session with Authorization: Bearer token returns 200", async () => {
    await signUp(auth, "bearer-session@example.com");

    // Sign in to get the token
    const signInRes = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "https://tauri.localhost",
        },
        body: JSON.stringify({
          email: "bearer-session@example.com",
          password: "correcthorsebattery1",
        }),
      }),
    );
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

    const signInRes = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "https://tauri.localhost",
        },
        body: JSON.stringify({
          email: "bearer-material@example.com",
          password: "correcthorsebattery1",
        }),
      }),
    );
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
});
