import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { type BetterAuthPlugin } from "better-auth";

type ZkFields = {
  kdfSalt: string;
  encryptedSeed: string;
  recoveryProofHmac: string;
  accountID: string;
};

type AuthMaterial = {
  kdfSalt: string;
  encryptedSeed: string;
  accountID: string;
};

const USER_MODEL = "user" as const;

/**
 * Better Auth plugin adding zero-knowledge fields to the user row.
 *
 * Storage contract:
 *   - kdfSalt:           32 random bytes (base64), client-generated
 *   - encryptedSeed:     AES-GCM envelope (base64) of the Jazz secretSeed,
 *                        encrypted under Argon2id(password, kdfSalt). Server
 *                        cannot decrypt it without the password.
 *   - recoveryProofHmac: HMAC-SHA256(seed, "arcan:recovery-reset")
 *                        in base64. Server compares (constant-time) at reset
 *                        time to prove the requester knows the seed.
 *   - accountID:         Jazz account ID string.
 *
 * Server never sees the raw seed.
 */
export const jazzZkPlugin = (): BetterAuthPlugin => ({
  id: "jazz-zk-plugin",
  schema: {
    user: {
      fields: {
        kdfSalt:           { type: "string", required: false, input: false, returned: false },
        encryptedSeed:     { type: "string", required: false, input: false, returned: false },
        recoveryProofHmac: { type: "string", required: false, input: false, returned: false },
        accountID:         { type: "string", required: false, input: false },
      },
    },
  },
  init() {
    return {
      options: {
        databaseHooks: {
          user: {
            create: {
              before: async (_user: unknown, context: unknown) => {
                const zk = (context as { jazzZk?: ZkFields } | undefined)?.jazzZk;
                if (!zk) {
                  throw new APIError("UNPROCESSABLE_ENTITY", {
                    message: "x-jazz-zk header required for sign-up",
                  });
                }
                return {
                  data: {
                    kdfSalt: zk.kdfSalt,
                    encryptedSeed: zk.encryptedSeed,
                    recoveryProofHmac: zk.recoveryProofHmac,
                    accountID: zk.accountID,
                  },
                };
              },
            },
          },
        },
      },
    };
  },
  endpoints: {
    // GET /me/auth-material — session-gated, returns kdfSalt + encryptedSeed
    getAuthMaterial: createAuthEndpoint(
      "/me/auth-material",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED", { message: "Not signed in" });
        const material = await fetchAuthMaterial(session.user.id, ctx);
        if (!material) throw new APIError("NOT_FOUND", { message: "User not found" });
        return ctx.json(material);
      },
    ),
    // POST /reset-with-recovery
    resetWithRecovery: createAuthEndpoint(
      "/reset-with-recovery",
      { method: "POST" },
      async (ctx) => {
        const body = (ctx.body ?? {}) as Partial<{
          accountID: string;
          proof: string;
          newPassword: string;
          newKdfSalt: string;
          newEncryptedSeed: string;
        }>;
        for (const field of ["accountID", "proof", "newPassword", "newKdfSalt", "newEncryptedSeed"] as const) {
          if (typeof body[field] !== "string" || (body[field] as string).length === 0) {
            throw new APIError("BAD_REQUEST", { message: `${field} required` });
          }
        }
        const accountID = body.accountID!;
        const proof = body.proof!;
        const newPassword = body.newPassword!;
        const newKdfSalt = body.newKdfSalt!;
        const newEncryptedSeed = body.newEncryptedSeed!;

        const user = await ctx.context.adapter.findOne<{
          id: string;
          recoveryProofHmac: string;
        }>({
          model: USER_MODEL,
          where: [{ field: "accountID", operator: "eq", value: accountID }],
          select: ["id", "recoveryProofHmac"],
        });
        if (!user || !user.recoveryProofHmac) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid recovery" });
        }
        if (!constantTimeEqual(user.recoveryProofHmac, proof)) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid recovery" });
        }

        const passwordHash = await ctx.context.password.hash(newPassword);

        // Update the user row's envelope fields
        await ctx.context.adapter.update({
          model: USER_MODEL,
          where: [{ field: "id", operator: "eq", value: user.id }],
          update: {
            kdfSalt: newKdfSalt,
            encryptedSeed: newEncryptedSeed,
          },
        });
        // Rotate credential password
        await ctx.context.internalAdapter.updatePassword(user.id, passwordHash);
        // Revoke all prior sessions
        await ctx.context.internalAdapter.deleteSessions(user.id);

        // Mint a fresh session for the requester
        const newSession = await ctx.context.internalAdapter.createSession(user.id);
        if (!newSession) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });
        }
        const userRow = await ctx.context.adapter.findOne<{
          id: string; email: string; emailVerified: boolean; name: string;
          createdAt: Date; updatedAt: Date;
        }>({
          model: USER_MODEL,
          where: [{ field: "id", operator: "eq", value: user.id }],
        });
        if (!userRow) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "User vanished after update" });
        }
        await setSessionCookie(ctx, { session: newSession, user: userRow as never });
        return ctx.json({ ok: true });
      },
    ),
  },
  hooks: {
    before: [
      // Extract x-jazz-zk header on sign-up and stash on context.
      // Always run on /sign-up* (don't pre-filter by header) so a request
      // missing the header fails fast inside the handler — before BA hashes
      // the password. Defense in depth.
      {
        matcher: (ctx) => !!ctx.path?.startsWith("/sign-up"),
        handler: createAuthMiddleware(async (ctx) => {
          const header = ctx.headers?.get("x-jazz-zk");
          if (!header) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: "x-jazz-zk header required for sign-up",
            });
          }
          let parsed: ZkFields;
          try {
            parsed = JSON.parse(header) as ZkFields;
          } catch {
            throw new APIError("BAD_REQUEST", { message: "Invalid x-jazz-zk header" });
          }
          for (const field of ["kdfSalt", "encryptedSeed", "recoveryProofHmac", "accountID"] as const) {
            if (typeof parsed[field] !== "string" || parsed[field].length === 0) {
              throw new APIError("BAD_REQUEST", { message: `x-jazz-zk.${field} required` });
            }
          }
          return { context: { jazzZk: parsed } };
        }),
      },
      // Stash newKdfSalt/newEncryptedSeed from /change-password body BEFORE
      // BA's validation strips them. We re-read raw JSON.
      {
        matcher: (ctx) => ctx.path === "/change-password",
        handler: createAuthMiddleware(async (ctx) => {
          // ctx.body is the parsed JSON body before endpoint validation
          const body = (ctx.body ?? {}) as Partial<{
            newKdfSalt: string;
            newEncryptedSeed: string;
          }>;
          if (typeof body.newKdfSalt !== "string" || body.newKdfSalt.length === 0) {
            throw new APIError("BAD_REQUEST", { message: "newKdfSalt required" });
          }
          if (typeof body.newEncryptedSeed !== "string" || body.newEncryptedSeed.length === 0) {
            throw new APIError("BAD_REQUEST", { message: "newEncryptedSeed required" });
          }
          return {
            context: {
              jazzZkRotate: { newKdfSalt: body.newKdfSalt, newEncryptedSeed: body.newEncryptedSeed },
            },
          };
        }),
      },
    ],
    after: [
      // Bundle the ZK fields into sign-in / sign-up / get-session responses
      {
        matcher: (ctx) =>
          !!ctx.path?.startsWith("/sign-in") ||
          !!ctx.path?.startsWith("/sign-up") ||
          !!ctx.path?.startsWith("/get-session"),
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
          if (!returned?.user?.id) return;
          const material = await fetchAuthMaterial(returned.user.id, ctx);
          if (!material) return;
          return ctx.json({ ...returned, jazzZk: material });
        }),
      },
      // On /change-password success, atomically rotate kdfSalt + encryptedSeed
      {
        matcher: (ctx) => ctx.path === "/change-password",
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
          if (!returned?.user?.id) return; // change-password failed; nothing to rotate
          const rotate = (ctx.context as { jazzZkRotate?: { newKdfSalt: string; newEncryptedSeed: string } }).jazzZkRotate
            ?? (ctx as unknown as { jazzZkRotate?: { newKdfSalt: string; newEncryptedSeed: string } }).jazzZkRotate;
          if (!rotate) return;
          await ctx.context.adapter.update({
            model: USER_MODEL,
            where: [{ field: "id", operator: "eq", value: returned.user.id }],
            update: {
              kdfSalt: rotate.newKdfSalt,
              encryptedSeed: rotate.newEncryptedSeed,
            },
          });
        }),
      },
    ],
  },
});

async function fetchAuthMaterial(
  userId: string,
  ctx: { context: { adapter: unknown } },
): Promise<AuthMaterial | null> {
  const adapter = ctx.context.adapter as {
    findOne: <T>(args: { model: string; where: Array<{ field: string; operator: string; value: unknown }>; select?: string[] }) => Promise<T | null>;
  };
  const row = await adapter.findOne<{
    kdfSalt: string;
    encryptedSeed: string;
    accountID: string;
  }>({
    model: USER_MODEL,
    where: [{ field: "id", operator: "eq", value: userId }],
    select: ["kdfSalt", "encryptedSeed", "accountID"],
  });
  if (!row || !row.kdfSalt || !row.encryptedSeed || !row.accountID) return null;
  return {
    kdfSalt: row.kdfSalt,
    encryptedSeed: row.encryptedSeed,
    accountID: row.accountID,
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
