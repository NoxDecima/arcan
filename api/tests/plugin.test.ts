import { describe, test, expect, beforeEach } from "vitest";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { jazzZkPlugin } from "../src/plugin.js";

async function makeAuth() {
  const db = new Database(":memory:");
  const config = {
    database: db,
    secret: "test-secret-test-secret-test-secret-test",
    baseURL: "http://localhost/api/auth",
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    plugins: [jazzZkPlugin()],
  };
  const migrations = await getMigrations(config);
  await migrations.runMigrations();
  return betterAuth(config);
}

const zkPayload = {
  kdfSalt: Buffer.from("salt-of-32-bytes-aaaaaaaaaaaaaaa").toString("base64"),
  encryptedSeed: Buffer.from("encrypted-seed-blob-aaaaaaaaaaaa").toString("base64"),
  recoveryProofHmac: Buffer.from("hmac-of-32-bytes-aaaaaaaaaaaaaa").toString("base64"),
  accountID: "co_zABC123",
};

type Auth = Awaited<ReturnType<typeof makeAuth>>;

async function signUp(auth: Auth, email: string) {
  return auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-zk": JSON.stringify(zkPayload),
      },
      body: JSON.stringify({
        email,
        password: "correcthorsebattery1",
        name: "alice",
      }),
    }),
  );
}

describe("jazzZkPlugin", () => {
  let auth: Auth;
  beforeEach(async () => { auth = await makeAuth(); });

  test("sign-up requires x-jazz-zk header", async () => {
    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.c", password: "correcthorsebattery1", name: "a" }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("sign-up persists ZK fields and returns them in response", async () => {
    const res = await signUp(auth, "alice@example.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jazzZk).toMatchObject({
      kdfSalt: zkPayload.kdfSalt,
      encryptedSeed: zkPayload.encryptedSeed,
      accountID: zkPayload.accountID,
    });
  });

  test("sign-in returns ZK fields with correct password", async () => {
    await signUp(auth, "alice@example.com");
    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "correcthorsebattery1" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jazzZk.encryptedSeed).toBe(zkPayload.encryptedSeed);
    expect(body.jazzZk.kdfSalt).toBe(zkPayload.kdfSalt);
  });

  test("sign-in fails with wrong password", async () => {
    await signUp(auth, "alice@example.com");
    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "wrongpassword12" }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("reset-with-recovery rejects wrong proof", async () => {
    await signUp(auth, "alice@example.com");
    const res = await auth.handler(
      new Request("http://localhost/api/auth/reset-with-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountID: zkPayload.accountID,
          proof: "wrong-proof",
          newPassword: "anotherlongpassword12",
          newKdfSalt: "new-salt",
          newEncryptedSeed: "new-seed",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("reset-with-recovery accepts correct proof and rotates envelope", async () => {
    await signUp(auth, "alice@example.com");
    const res = await auth.handler(
      new Request("http://localhost/api/auth/reset-with-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountID: zkPayload.accountID,
          proof: zkPayload.recoveryProofHmac,
          newPassword: "anotherlongpassword12",
          newKdfSalt: Buffer.from("new-salt-32-bytes-bbbbbbbbbbbbbb").toString("base64"),
          newEncryptedSeed: Buffer.from("new-seed-blob-bbbbbbbbbbbbbbbbbb").toString("base64"),
        }),
      }),
    );
    expect(res.status).toBe(200);
    // Old password no longer works
    const signIn = await auth.handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "correcthorsebattery1" }),
      }),
    );
    expect(signIn.status).toBeGreaterThanOrEqual(400);
  });
});
