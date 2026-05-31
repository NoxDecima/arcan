import { describe, test, expect } from "vitest";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { jazzZkPlugin } from "../src/plugin.js";

const PASSWORD = "correcthorsebattery1";
const SEED_BYTES_BASE64 = Buffer.from(new Uint8Array(32).fill(0x42)).toString("base64");

describe("zero-knowledge contract", () => {
  test("server stores no plaintext password and no plaintext seed", async () => {
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
    const auth = betterAuth(config);

    const zk = {
      kdfSalt: "salt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      encryptedSeed: "encrypted-aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recoveryProofHmac: "hmac-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      accountID: "co_zABC",
    };

    await auth.handler(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jazz-zk": JSON.stringify(zk),
        },
        body: JSON.stringify({ email: "alice@example.com", password: PASSWORD, name: "alice" }),
      }),
    );

    // Dump every row of every table and assert none contain plaintext
    const tables: { name: string }[] = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[];

    for (const { name } of tables) {
      const rows = db.prepare(`SELECT * FROM ${name}`).all();
      for (const row of rows) {
        for (const [field, value] of Object.entries(row as Record<string, unknown>)) {
          if (typeof value !== "string") continue;
          expect(value, `table=${name} field=${field}`).not.toContain(PASSWORD);
          expect(value, `table=${name} field=${field}`).not.toBe(SEED_BYTES_BASE64);
        }
      }
    }
  });
});
