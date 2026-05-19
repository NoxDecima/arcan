# Jazz API Notes (jazz-tools 0.20.18)

> Reference document for E1a Slice 1 implementation.
> Verified against `node_modules/jazz-tools/` on 2026-05-15.
> When jazz-tools version changes, re-run this survey.

---

## 1. React Provider

### Import

```ts
import { JazzReactProvider } from "jazz-tools/react";
import type { JazzProviderProps } from "jazz-tools/react";
```

### Full prop signature (from `dist/react/provider.d.ts`)

```ts
type JazzProviderProps<S extends AccountClass<Account> | AnyAccountSchema> = {
  children: React.ReactNode;
  enableSSR?: boolean;
  fallback?: React.ReactNode | null;   // shown while context initialises
  authSecretStorageKey?: string;       // custom localStorage key for credentials
  // Plus all JazzContextManagerProps:
  guestMode?: boolean;
  sync: SyncConfig;                    // required
  storage?: "indexedDB";
  AccountSchema?: S;
  defaultProfileName?: string;
  onLogOut?: () => void;
  logOutReplacement?: () => void;
  onAnonymousAccountDiscarded?: (account: InstanceOfSchema<S>) => Promise<void>;
  experimental_clockSyncFromServerPings?: boolean;
};
```

### `SyncConfig` shape (from `dist/tools/types.d.ts`)

```ts
type SyncConfig =
  | { peer: `wss://${string}` | `ws://${string}`; when?: "always" | "signedUp" }
  | { peer?: `wss://${string}` | `ws://${string}`; when: "never" };
```

The `peer` field must be a WebSocket URL — the `ws://` or `wss://` prefix is enforced by the type literal. Local dev server example: `ws://localhost:4200`.

### AccountSchema binding

Pass your `co.account(...)` result directly as the `AccountSchema` prop. The generic `S` is inferred automatically so `useAccount()` and `useCoState()` return properly typed values.

### Working example

```tsx
import { JazzReactProvider } from "jazz-tools/react";
import { JazzMessangerAccount } from "./jazz/schema/JazzMessangerAccount";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <JazzReactProvider
      sync={{ peer: "ws://localhost:4200" }}
      AccountSchema={JazzMessangerAccount}
      storage="indexedDB"
      fallback={<div>Loading Jazz…</div>}
    >
      {children}
    </JazzReactProvider>
  );
}
```

### Caveats

- Nesting `JazzReactProvider` inside another throws immediately at runtime.
- `fallback` defaults to `null` (renders nothing) while the context is initialising. Use it to avoid layout flashes.
- The provider renders `children` only after the context is ready (auth resolved).
- `authSecretStorageKey` lets you namespace the credential store; useful if you run multiple Jazz apps on the same origin.
- `onAnonymousAccountDiscarded` fires when an anonymous (guest) session is discarded because the user signed in. Use it to migrate data from the guest session.

---

## 2. Passphrase Auth

### Import paths

```ts
// Hook (React) — recommended for components
import { usePassphraseAuth } from "jazz-tools/react";
// or equivalently from the core package:
import { usePassphraseAuth } from "jazz-tools/react-core";

// Built-in basic UI component (optional, ships a simple sign-in form)
import { PassphraseAuthBasicUI } from "jazz-tools/react";

// Low-level class (non-React / server contexts)
import { PassphraseAuth } from "jazz-tools";
```

### Wordlist

Passphrases are BIP-39 mnemonics. The wordlist must come from outside jazz-tools:

```ts
import { wordlist } from "@scure/bip39/wordlists/english";
// wordlist is string[] — 2048 words
```

`@scure/bip39` is a direct dependency of `jazz-tools` so it is always available.

### `usePassphraseAuth` hook

```ts
const auth = usePassphraseAuth({ wordlist });
```

Returns:

| Field | Type | Description |
|---|---|---|
| `state` | `"anonymous" \| "signedIn"` | Current auth state |
| `passphrase` | `string` | Current passphrase (empty string until loaded) |
| `generateRandomPassphrase` | `() => string` | Creates a fresh 24-word BIP-39 mnemonic |
| `signUp` | `(name?: string) => Promise<string>` | Promotes anonymous session to named account, returns passphrase |
| `logIn` | `(passphrase: string) => Promise<void>` | Restores existing account from passphrase |
| `registerNewAccount` | `(passphrase: string, name: string) => Promise<string>` | Creates a new account from a specific passphrase, returns account ID |

### Sign-up flow (new account, passphrase is generated)

```ts
// 1. Generate a passphrase before the user has committed to one:
const draft = auth.generateRandomPassphrase();
// Show draft to user, let them copy it.

// 2. When user confirms, create the account:
const passphrase = await auth.signUp("Alice");
// passphrase === draft (the same secret seed is used)
// auth.state becomes "signedIn"
```

`signUp` reads the existing anonymous session's `secretSeed` from `AuthSecretStorage` and upgrades it — no new secret is generated. The returned string is the BIP-39 encoding of that seed.

### Sign-in / restore flow (returning user)

```ts
await auth.logIn(passphraseString);
// Throws Error("Invalid passphrase") if mnemonic parsing fails
// auth.state becomes "signedIn" on success
```

### `registerNewAccount` (create from a specific passphrase)

```ts
const accountId = await auth.registerNewAccount(specificPassphrase, "Alice");
// Creates a new Jazz account whose key is derived from specificPassphrase.
// Returns the account ID string.
```

Use this when you want to pre-generate the passphrase on behalf of the user.

### Error shapes

All errors are plain `Error` objects thrown from async methods. The only documented error message is `"Invalid passphrase"` (thrown by `logIn` when `@scure/bip39.mnemonicToEntropy` fails). There is no structured error type — wrap calls in `try/catch` and inspect `error.message`.

### PassphraseAuthBasicUI

A pre-built React component that renders a sign-up / sign-in form:

```tsx
import { PassphraseAuthBasicUI } from "jazz-tools/react";
import { wordlist } from "@scure/bip39/wordlists/english";

<PassphraseAuthBasicUI appName="Jazz Messenger" wordlist={wordlist}>
  {/* children rendered only when signed in */}
</PassphraseAuthBasicUI>
```

This is a convenience wrapper — it calls `usePassphraseAuth` internally, renders the form when `state === "anonymous"`, and renders `children` when `state === "signedIn"`.

---

## 3. React Hooks

All hooks are exported from both `jazz-tools/react` and `jazz-tools/react-core`. Prefer importing from `jazz-tools/react` in application code.

### `useAccount`

```ts
import { useAccount } from "jazz-tools/react";

const me = useAccount(
  AccountSchema,          // optional — pass your co.account() schema for typed result
  {
    resolve?: ResolveQueryStrict<A, R>;   // which nested CoValues to deep-load
    select?: (account: MaybeLoaded<Loaded<A, R>>) => TSelectorReturn;
    equalityFn?: (a: TSelectorReturn, b: TSelectorReturn) => boolean;
  }
);
```

**Loading-state pattern:**

```tsx
const me = useAccount(JazzMessangerAccount, {
  resolve: { profile: true, root: { contactBook: true } },
});

if (!me.$isLoaded) {
  switch (me.$jazz.loadingState) {
    case "loading":   return <Spinner />;
    case "unauthorized": return <p>Access denied</p>;
    case "unavailable":  return <p>Account not found</p>;
  }
}

// me.profile.displayName etc. are now accessible
```

`$isLoaded` is `false` while loading; checking it first narrows the type so TypeScript knows fields are available.

**The plan assumed** `useAccount(Schema, { resolve: { profile: true, contactBook: true } })`. The **actual** signature is identical in structure — `resolve` is an object matching the schema shape, with `true` for shallow-load or a nested object for deeper loads.

### `useCoState`

```ts
import { useCoState } from "jazz-tools/react";

const project = useCoState(
  ProjectSchema,   // co.map(...)  schema
  projectId,       // string | undefined — undefined returns "unavailable" state
  {
    resolve?: { tasks: { $each: true } };  // optional deep-load
    select?: (value) => narrowedValue;
    equalityFn?: (a, b) => boolean;
  }
);
```

Same `$isLoaded` / `$jazz.loadingState` pattern as `useAccount`.

### Suspense variants

```ts
import { useSuspenseAccount, useSuspenseCoState } from "jazz-tools/react";
```

These do not return `MaybeLoaded` — they suspend (throw a Promise) until the value is loaded, and return `Loaded<S, R>` directly. Use inside `<Suspense>` boundaries.

### Other hooks

```ts
// Subscribe to multiple CoValues at once
const [v1, v2] = useCoStates(Schema, [id1, id2], { resolve: ... });
const [v1, v2] = useSuspenseCoStates(Schema, [id1, id2]);

// Accept an invite link from the current URL
useAcceptInvite({
  invitedObjectSchema: ConversationSchema,
  onAccept: (valueID: string) => navigate(`/conversation/${valueID}`),
  forValueHint?: string,
});

// Log out
const logOut = useLogOut();
logOut(); // synchronous trigger

// Connection status
const isConnected = useSyncConnectionStatus();
// true = connected, false = disconnected (5s lag detection)

// Check authentication
import { useIsAuthenticated } from "jazz-tools/react";
const isAuthenticated = useIsAuthenticated();
```

### Resolve query syntax

The resolve query mirrors the CoValue's shape. Key patterns:

```ts
// Shallow-load a CoMap ref
{ profile: true }

// Deep-load a list's items
{ tasks: { $each: true } }

// Deep-load items plus their nested refs
{ tasks: { $each: { assignee: true } } }

// Catch errors on individual items without blocking parent
{ tasks: { $each: { $onError: "catch" } } }

// Load account root and its contents
{ profile: true, root: { contactBook: true } }
```

---

## 4. Account Creation and Migration

### `withMigration` on `co.account()`

```ts
export const JazzMessangerAccount = co.account({
  profile: co.profile({ displayName: z.string(), bio: z.string().optional() }),
  root: JazzMessangerAccountRoot,
}).withMigration(async (me, creationProps) => {
  // me is Loaded<AccountSchema> — fully typed
  // creationProps is { name: string } | undefined

  if (!me.$jazz.has("root")) {
    const contactBook = ContactBook.create({}, { owner: me });
    const devices = co.list(DeviceRecord).create([], { owner: me });
    const invites = co.list(Invitation).create([], { owner: me });

    me.$jazz.set("root", JazzMessangerAccountRoot.create({
      contactBook,
      devices,
      invitesIssued: invites,
    }, { owner: me }));
  }
});
```

**How it runs:** `withMigration` assigns `migration` to `AccountSchema.coValueClass.prototype.migrate`. The Jazz runtime calls `account.applyMigration(creationProps)` automatically, both for new accounts (during creation) and for existing accounts every time the node is loaded. This means the migration function runs on every app start for every account — it must be idempotent (use `has()` guards).

**After the user-defined migration runs**, the framework itself ensures `profile` and `inbox`/`inboxInvite` slots are created if missing. This means if you do not create `profile` inside `withMigration`, the framework will create a default `Profile` with `creationProps.name`. However, if your schema has a custom `co.profile(...)` shape, you should create it yourself to ensure the extra fields are populated.

**`creationProps`** is `{ name: string }` on first creation (comes from `signUp(name)`), and `undefined` on subsequent loads.

### Initializing profile fields at creation time

```ts
.withMigration(async (me, creationProps) => {
  if (!me.$jazz.has("profile")) {
    const profileGroup = Group.create({ owner: me });
    me.$jazz.set("profile", co.profile({
      displayName: z.string(),
      bio: z.string().optional(),
    }).create({
      name: creationProps?.name ?? "Anonymous",
      displayName: creationProps?.name ?? "Anonymous",
    }, profileGroup));
    profileGroup.addMember("everyone", "reader");
  }
})
```

### Does the migration run automatically?

Yes. `applyMigration` is called by `createJazzContextFromExistingCredentials` and `createJazzContextForNewAccount` as part of the node startup sequence — before `JazzReactProvider` resolves its context. No manual invocation is needed.

---

## 5. Groups and Permissions

### Creating a Group

```ts
import { Group } from "jazz-tools";

// Create a group owned by the current account (uses activeAccountContext)
const group = Group.create();

// Explicitly pass an owner account
const group = Group.create({ owner: me });

// With a display name (immutable, stored in plaintext)
const group = Group.create({ owner: me, name: "My Conversation" });
```

The `static create` signature is:

```ts
static create<G extends Group>(
  options?: { owner?: Account; name?: string } | Account
): G;
```

If no owner is provided, `Group.create()` uses the active account context (set by the Jazz runtime).

### Adding members

```ts
// Grant a role to an account
group.addMember(otherAccount, "writer");   // or "reader" | "admin" | "manager"

// Make public (readable by everyone)
group.addMember("everyone", "reader");     // or "writer"
// Convenience alias:
group.makePublic("reader");

// Inherit all members from a parent group
group.addMember(parentGroup, "inherit");   // or specific role
```

Available roles for `Account` members: `"reader" | "writer" | "admin" | "manager"`.  
For `"everyone"`: `"reader" | "writer" | "writeOnly"`.

### Removing members

```ts
group.removeMember(otherAccount);  // revokes access
group.removeMember("everyone");    // removes public access
group.removeMember(parentGroup);   // revokes group inheritance
```

Removing a member rotates group keys — existing content remains encrypted with the old key until re-encrypted. ⚠️ unverified — check cojson docs for key rotation semantics.

### Checking your role

```ts
group.myRole(); // => "reader" | "writer" | "admin" | undefined
group.getRoleOf(accountId); // => Role | undefined
```

### Creating a CoValue owned by a Group

```ts
// Any schema created with co.map / co.list / co.record etc.
const conversation = Conversation.create(
  { title: "General", participants: [] },
  { owner: group }   // CoValueCreateOptions: pass Group or Account
);

// Shorthand: pass the owner directly (Account or Group)
const msg = Message.create({ body: "Hello", sentAt: new Date(), attachments: [] }, group);
```

The `owner` field in `CoValueCreateOptions` accepts either `Account` or `Group`. If omitted, a fresh `Group.create()` is used automatically.

---

## 6. CoValue Creation and Update

### Creating CoValues from Zod-based schemas

All `co.map()`, `co.list()`, `co.record()`, etc. results have a `.create()` method:

```ts
const Schema = co.map({ title: z.string(), count: z.number() });
const instance = Schema.create(
  { title: "Hello", count: 0 },
  { owner: groupOrAccount }
);
```

Signature for `CoMapSchema.create`:
```ts
create(
  init: CoMapSchemaInit<Shape>,   // required fields only; optional fields can be omitted
  options?: CoValueCreateOptions  // owner, unique, validation
): CoMapInstanceShape<Shape> & CoMap
```

`CoValueCreateOptions` is:
```ts
type CoValueCreateOptions =
  | undefined                          // auto-creates a new Group
  | Account                            // use this account's group
  | Group                              // use this group directly
  | { owner?: Account | Group; unique?: string; validation?: LocalValidationMode };
```

### CoList mutation (all via `.$jazz`)

```ts
// Direct push/pop/shift are deprecated on the class itself.
// Use .$jazz methods:
list.$jazz.push(item);
list.$jazz.unshift(item);
list.$jazz.pop();
list.$jazz.shift();
list.$jazz.splice(startIndex, deleteCount, ...items);
list.$jazz.set(index, item);
list.$jazz.remove(index);            // by index
list.$jazz.remove(predicate);        // by predicate fn
list.$jazz.retain(predicate);        // keep only matching items
list.$jazz.applyDiff(newArray);      // diff-based bulk update
```

### CoMap field update

```ts
// Direct property assignment on the proxy:
instance.fieldName = newValue;

// Or via $jazz.set for explicit control:
instance.$jazz.set("fieldName", newValue);

// Bulk update (diff-based):
instance.$jazz.applyDiff({ fieldA: val1, fieldB: val2 });

// Delete optional field:
instance.$jazz.delete("optionalField");
```

Field assignment through the proxy (`instance.fieldName = x`) is the idiomatic pattern. For account `profile` and `root` slots, use `me.$jazz.set(key, value)` because those are special slots without direct assignment.

### Checking if a field is set

```ts
instance.$jazz.has("fieldName"); // boolean — checks the raw CoMap entry
```

### Loading CoValues by ID (non-React)

```ts
// Schema-level load (preferred)
const project = await ProjectSchema.load(id, {
  loadAs: me,          // optional — defaults to active account
  resolve: { tasks: { $each: true } },
});

// Non-React subscribe
const unsub = ProjectSchema.subscribe(id, { resolve: { tasks: true } }, (project, unsubscribe) => {
  console.log(project);
});
```

---

## 7. Storage and Sync

### IndexedDB persistence

Pass `storage="indexedDB"` to `JazzReactProvider`. This is opt-in, not automatic. Without it, data lives only in memory (lost on page reload).

```tsx
<JazzReactProvider
  sync={{ peer: "ws://localhost:4200" }}
  AccountSchema={JazzMessangerAccount}
  storage="indexedDB"   // <-- enables IndexedDB persistence
>
```

Internally the provider uses `cojson-storage-indexeddb` (bundled as a dependency of `jazz-tools`).

### WebSocket sync

The `sync.peer` URL is passed directly to `cojson-transport-ws` (also a bundled dependency). The peer field type is a TypeScript template literal restricting it to `ws://` or `wss://` schemes. Passing `http://` or similar will fail TypeScript type-checking.

```ts
// Development local sync server
sync={{ peer: "ws://localhost:4200" }}

// Production sync server (jazz.tools cloud)
sync={{ peer: "wss://cloud.jazz.tools/?key=your-key" }}

// Conditional — only sync when signed in
sync={{ peer: "ws://localhost:4200", when: "signedUp" }}

// Disable sync entirely (offline-only)
sync={{ when: "never" }}
```

### Offline / unreachable server behavior

When the sync server is unreachable, the Jazz node continues to work locally with data from IndexedDB. Changes are queued and synced when the connection is restored. `useSyncConnectionStatus()` returns `false` when disconnected (with a ~5-second detection delay from missing server pings).

### Auth credential storage

Credentials (account ID + secret) are stored in `localStorage` under a key managed by `AuthSecretStorage`. The key defaults to a Jazz-internal value but can be overridden with the `authSecretStorageKey` prop on `JazzReactProvider`.

---

## 8. CoValue Schema Summary (verified patterns)

This section summarises the schema patterns already in use in the repo and confirms they are correct for 0.20.18.

```ts
import { co, z, Group } from "jazz-tools";

// Primitive CoMap
const Schema = co.map({ field: z.string(), count: z.number() });

// Optional primitive
co.map({ bio: z.string().optional() });

// Required CoMap ref
co.map({ owner: ProfileSchema });

// Optional CoMap ref
co.map({ avatar: ProfileSchema.optional() });
// or: co.map({ avatar: co.optional(ProfileSchema) });

// CoList of CoValue refs
co.map({ messages: co.list(MessageSchema) });

// String-keyed record (like a dict)
co.record(z.string(), z.string());

// Recursive self-reference (getter pattern required)
const Message = co.map({
  body: z.string(),
  get replyTo() { return Message.optional(); },
});

// Literal / enum
z.enum(["dm", "group"]);

// File / binary blob
co.fileStream();

// Account with profile and root
co.account({
  profile: co.profile({ displayName: z.string() }),
  root: co.map({ data: z.string() }),
}).withMigration(async (me, creationProps) => {
  // initialise root, profile, etc.
});
```

---

## 9. Invite Links

```ts
import { createInviteLink, parseInviteLink } from "jazz-tools/react";

// Create an invite link for a CoValue or Group
const link = createInviteLink(conversationInstance, "writer", {
  baseURL: "https://myapp.example.com",
  valueHint: "conversation",   // optional — shown in URL for debugging
});
// link is a full URL string ending with ?invite=…

// Accept invite from URL in a React component
import { useAcceptInvite } from "jazz-tools/react";
useAcceptInvite({
  invitedObjectSchema: ConversationSchema,
  onAccept: (valueID) => navigate(`/conversation/${valueID}`),
  forValueHint: "conversation",
});

// Low-level: accept programmatically
const result = await me.acceptInvite(valueID, inviteSecret, ConversationSchema);
```

---

## 10. Plan Deviations and Corrections

The following items in the original Phase C plan need to be updated based on verified 0.20.18 behaviour.

### Confirmed correct

- `co.account({ profile, root }).withMigration(...)` — exact syntax, verified.
- `Group.create({ owner: me })` — correct.
- `group.addMember(account, "writer")` — correct.
- `group.addMember("everyone", "reader")` — correct.
- `Schema.create(init, { owner: group })` — correct.
- `useAccount(Schema, { resolve: { profile: true } })` — correct.
- `useCoState(Schema, id, { resolve: { $each: true } })` — correct.
- `usePassphraseAuth({ wordlist })` returning `{ signUp, logIn, generateRandomPassphrase, registerNewAccount }` — correct.

### Deviations from original plan assumptions

| Plan assumption | Actual API |
|---|---|
| `useAccount()` returns `{ me, ... }` | Returns `me` directly (not wrapped in object). Check `me.$isLoaded` to guard access. |
| `useAccount(Schema, { resolve: { profile: true } })` | Correct — but the full `me` value is returned (not `{ me }`) |
| The plan mentioned `me.root.contactBook` access — fine as long as resolve includes `root` | Without `root: { contactBook: true }` in resolve, `me.root` is `NotLoaded` |
| CoList mutation `coList.push(...)` | Deprecated on the class — use `coList.$jazz.push(...)` |
| CoMap field update via `coMap.field = val` | Works via the Proxy — but for account `profile`/`root` slots use `me.$jazz.set(key, val)` |
| `withMigration` runs only at creation | Runs on every node startup for every account — must be idempotent |
| Passphrase from dedicated sub-export `jazz-tools/passphrase` | Does not exist. Import from `jazz-tools/react` (hook) or `jazz-tools` (class) |
| `useAccount()` without schema arg | Still valid (returns base `Account` type) |

### Items not found / unverified

- **Error codes for invalid passphrase word count or checksum**: `logIn` throws a plain `Error` with message `"Invalid passphrase"` for any mnemonic parse failure. There is no structured error with a code distinguishing "wrong word" from "wrong length" from "bad checksum". ⚠️ All three map to the same error.
- **Key rotation on `removeMember`**: The `removeMember` method calls `cojson`'s `raw.removeMember`. Whether this rotates encryption keys is a cojson-level detail not surfaced in jazz-tools types. ⚠️ unverified — check during implementation.
- **`co.group()` schema definer**: `coGroupDefiner` exists (exported as `co.group`) but returns a `GroupSchema` with no `.create()` signature documented in the `.d.ts`. The imperative `Group.create()` class method is the verified path. ⚠️ Use `Group` from `"jazz-tools"`, not `co.group()`, for creating groups.

---

## 11. Pubkey Extraction (verified 2026-05-16, jazz-tools 0.20.18)

### Finding

There is no single `account.pubkeyHex` getter in jazz-tools. The Ed25519
signing public key is accessible via the `ControlledAccountOrAgent` returned
by `localNode.getCurrentAgent()`.

### API path

```ts
import { base58 } from "@scure/base";
import type { Account } from "jazz-tools";

function getAccountPubkeyHex(account: Account): string {
  const agent = account.$jazz.localNode.getCurrentAgent();
  // SignerID format: "signer_z${base58_encoded_32_byte_ed25519_pubkey}"
  const signerID = agent.currentSignerID();
  const base58Part = signerID.slice("signer_z".length);
  const pubkeyBytes = base58.decode(base58Part);
  // Convert to 64-char lowercase hex
  return Array.from(pubkeyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### Key details

- `me.$jazz.localNode` is exposed by `CoValueJazzApi` (base of `AccountJazzApi`).
  Its getter is `get localNode(): LocalNode` returning `this.raw.core.node`.
- `localNode.getCurrentAgent()` returns `ControlledAccountOrAgent` from cojson,
  which always has `currentSignerID(): SignerID`.
- `SignerID = signer_z${string}` where the suffix is base58-encoded raw bytes.
- The underlying encoding uses `@scure/base`'s `base58` (NOT z-base32 — the `z`
  prefix is just a naming convention in cojson).
- Ed25519 public keys are exactly 32 bytes → 64 hex chars.
- `@scure/base` is a transitive dependency of `jazz-tools` (via `cojson`) and
  safe to import directly.

### Why not use the account ID?

`me.$jazz.id` (`co_z${base58}`) is the BLAKE3 hash of the initial agent
secret — it is NOT the raw Ed25519 public key. Do not use it for pubkey
derivation.

---

## 12. Session Fingerprint (verified 2026-05-16, jazz-tools 0.20.18)

### Finding

`me.$jazz.sessionID` is the stable session fingerprint. It is set in
`AccountJazzApi` when `isLocalNodeOwner === true` (i.e. this is the signed-in
user's account).

### API path

```ts
import type { Account } from "jazz-tools";

function getCurrentSessionFingerprint(account: Account): string {
  const sessionID = account.$jazz.sessionID;
  if (!sessionID) {
    throw new Error("Not the local node owner");
  }
  return sessionID;
}
```

### Key details

- `SessionID` format (from cojson): `${RawAccountID}_session_z${base58_nonce}`
  (active sessions) or `${RawAccountID}_session_d${base58_nonce}$` (deleted).
- The session ID is created once per node startup and stored in localStorage
  alongside account credentials. It is stable across page reloads for the
  same device + account pair.
- `me.$jazz.sessionID` is `SessionID | undefined` in the TypeScript type.
  It is `undefined` only when `isLocalNodeOwner === false`, which never
  happens for the signed-in `me` account.
- Source: `AccountJazzApi` constructor in `chunk-MIPBSAS7.js`:
  ```js
  this.isLocalNodeOwner = this.raw.id === this.localNode.getCurrentAgent().id;
  if (this.isLocalNodeOwner) {
    this.sessionID = this.localNode.currentSessionID;
  }
  ```

---

## 13. Raw-Secret Account Login

> Verified against `node_modules/jazz-tools/dist/` on 2026-05-16.  
> Relevant to Slice 2 QR multi-device pairing (Phase D).

### The question

Given a raw 32-byte `secretSeed` (`Uint8Array`) — the kind that is stored inside
`AuthSecretStorage` and that a BIP-39 passphrase encodes — how do you log in to
an existing Jazz account on a fresh browser session without going through the
passphrase derivation step?

### Finding: there IS a clean public API

The supported path uses two public exports from `jazz-tools`:
1. **`AuthSecretStorage`** — the credential store that `JazzReactProvider` reads on mount.
2. **`cojsonInternals`** (re-exported from `cojson`) — for deriving `accountID` from the
   secret when you do not already know the `accountID`.

And one internal hook (exported from `jazz-tools/react-core`):
- **`useJazzContextValue`** — gives access to the live `authenticate` function.

### The two-step API path

#### Step A (preferred): write credentials into `AuthSecretStorage`, then call `authenticate`

This is exactly what `PassphraseAuth.logIn` does internally
(`dist/index.js` lines 386-410):

```ts
// Pseudocode of PassphraseAuth.logIn — the raw-secret equivalent is identical
// except step 1 is skipped (no bip39.mnemonicToEntropy call needed).

const secretSeed: Uint8Array = /* 32 bytes received from QR pairing */;

// 1. Derive the AgentSecret from the raw seed
const accountSecret: AgentSecret = crypto.agentSecretFromSecretSeed(secretSeed);

// 2. Derive the deterministic accountID
const accountID = cojsonInternals.idforHeader(
  cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto),
  crypto
);

// 3. Call the authenticate function from the React context
await authenticate({ accountID, accountSecret });

// 4. Persist the credentials so the next page load restores them automatically
await authSecretStorage.set({
  accountID,
  secretSeed,        // optional but keeps secretSeed available for future signUp/passphrase reads
  accountSecret,
  provider: "passphrase",  // or a custom string like "qr-pairing"
});
```

#### Types

```ts
import type { AgentSecret } from "cojson";
import { AuthSecretStorage, type AuthSetPayload, cojsonInternals } from "jazz-tools";
import type { AuthCredentials } from "jazz-tools";   // from dist/tools/types.d.ts

// AuthCredentials (passed to authenticate):
type AuthCredentials = {
  accountID: ID<Account>;
  secretSeed?: Uint8Array;
  accountSecret: AgentSecret;          // `${SealerSecret}/${SignerSecret}` formatted string
  provider?: "anonymous" | "demo" | "passkey" | "passphrase" | string;
};

// AgentSecret (from cojson):
type AgentSecret = `${SealerSecret}/${SignerSecret}`;  // NOT raw bytes — a formatted string

// AuthSetPayload (passed to authSecretStorage.set):
type AuthSetPayload = {
  accountID: ID<Account>;
  secretSeed?: Uint8Array;             // the 32-byte raw seed (optional but recommended)
  accountSecret: AgentSecret;
  provider: "anonymous" | "clerk" | "betterauth" | "demo" | "passkey" | "passphrase" | string;
};
```

#### What the QR pairing should transfer

The QR payload (sealed-boxed) must contain at least **either**:

| Option | Transfer | Receiver derives |
|--------|----------|-----------------|
| A (preferred) | `secretSeed: Uint8Array` (32 bytes) | `accountSecret` via `crypto.agentSecretFromSecretSeed(secretSeed)`, then `accountID` via `cojsonInternals` |
| B | `accountSecret: AgentSecret` (formatted string) + `accountID` | nothing — call `authenticate` directly |

Option A is more compact (32 bytes vs ~80+ chars) and maintains the `secretSeed`
in `AuthSecretStorage` for future passphrase display.

### How to access `authenticate` and `crypto` in a React component

```ts
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react-core";
import { cojsonInternals } from "jazz-tools";
import type { AgentSecret } from "cojson";

function usePairingLogin() {
  const context = useJazzContextValue();    // JazzContextType<Account>
  const authSecretStorage = useAuthSecretStorage();

  if ("guest" in context) {
    throw new Error("Cannot pair in guest mode");
  }

  return async (secretSeed: Uint8Array) => {
    const crypto = context.node.crypto;

    const accountSecret: AgentSecret = crypto.agentSecretFromSecretSeed(secretSeed);
    const accountID = cojsonInternals.idforHeader(
      cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto),
      crypto
    ) as ID<Account>;

    // authenticate() triggers JazzContextManager.authenticate(), which tears down
    // the current anonymous/stale context and boots a new one for this account.
    await context.authenticate({ accountID, accountSecret });

    // Persist so JazzReactProvider restores on next page load.
    await authSecretStorage.set({
      accountID,
      secretSeed,
      accountSecret,
      provider: "qr-pairing",
    });
  };
}
```

### Alternative: write `AuthSecretStorage` and reload (no hook needed)

If you need to authenticate from outside the React tree (e.g., a service worker
or a post-message handler), you can write directly to `AuthSecretStorage` and
hard-reload. The provider reads `authSecretStorage.get()` on mount and boots with
those credentials automatically:

```ts
import { AuthSecretStorage, cojsonInternals } from "jazz-tools";
import type { AgentSecret } from "cojson";

async function loginWithRawSeedAndReload(secretSeed: Uint8Array) {
  const storage = new AuthSecretStorage();   // uses the same default key as JazzReactProvider
  const crypto = /* WasmCrypto.create() or obtain from node.crypto */;

  const accountSecret: AgentSecret = crypto.agentSecretFromSecretSeed(secretSeed);
  const accountID = cojsonInternals.idforHeader(
    cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto),
    crypto
  ) as ID<Account>;

  await storage.set({ accountID, secretSeed, accountSecret, provider: "qr-pairing" });
  window.location.reload();  // JazzReactProvider picks up credentials on mount
}
```

Caveat: `WasmCrypto` requires an async init (`await WasmCrypto.create()`).
If you already have a Jazz context open, grab `context.node.crypto` instead to
avoid a second WASM module load.

### Import paths summary

```ts
// All from the public API — no internals import required
import { AuthSecretStorage, cojsonInternals, type AuthSetPayload } from "jazz-tools";
import type { AuthCredentials }  from "jazz-tools";           // re-exported via tools/types.d.ts
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react-core";
// or equivalently:
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import type { AgentSecret } from "cojson";
```

### Key caveats for Phase D implementer

1. **`AgentSecret` is NOT raw bytes.** It is a formatted string
   `"sealerSecret_z…/signerSecret_z…"`. Do not try to transfer it as a `Uint8Array`;
   either transfer the 32-byte `secretSeed` and re-derive, or transfer the string
   directly.

2. **`authenticate()` vs `authSecretStorage.set()` ordering matters.**  
   `PassphraseAuth.logIn` calls `authenticate(...)` first (which triggers
   `JazzContextManager.authenticate` → `createContext`), then calls
   `authSecretStorage.set(...)` to persist. `authSecretStorage.set` also
   emits an `onUpdate` event, but by then the context is already being built.
   Follow the same order.

3. **`authSecretStorageKey` must match the provider's key.**  
   If `JazzReactProvider` was given a non-default `authSecretStorageKey`, use
   `new AuthSecretStorage(thatKey)` or use the `useAuthSecretStorage()` hook
   (which returns the instance the provider is already using).

4. **The `authenticate` call is idempotent for the same `accountID`.**  
   `JazzContextManager.authenticate` short-circuits silently if the same account
   is already authenticated (`context.me.$jazz.id === credentials.accountID`).
   This is safe but means you will not see a state change event if you call it
   with the current account's ID.

5. **No `secretSeed` = passphrase display breaks.**  
   If you omit `secretSeed` from `authSecretStorage.set(...)`, `PassphraseAuth`'s
   `getCurrentAccountPassphrase()` and `signUp()` will throw `"No credentials found"`.
   Always include `secretSeed` when you have it.

---

## 14. Create-Transaction Signer (`$jazz.createdBy`) — Slice 3a

> Verified against `node_modules/jazz-tools/dist/tools/coValues/CoValueBase.d.ts` on 2026-05-17.

### The question

Given a loaded CoValue (e.g., a `Message` instance), how do you get the accountID of the account that signed the create-transaction?

### Finding: clean public API exists

`CoValueJazzApi` (the type of `coValue.$jazz`) exposes a getter:

```ts
/**
 * Returns the account ID of the user who created this CoValue.
 *
 * Creation is determined by inspecting the earliest valid transaction.
 * Note: Where the author is a sealer/signer identifier (e.g. accounts)
 * nothing is returned intentionally.
 *
 * @returns {string | undefined} The creating user's account ID, or
 * `undefined` if no author can be determined.
 */
get createdBy(): string | undefined;
```

### Usage

```ts
export function getAuthorAccountIDFromMessage(message: any): string | null {
  return message?.$jazz?.createdBy ?? null;
}
```

This is signed by the authoring session key and is **immutable** — no post-hoc Group manipulation can change who signed the create transaction. This is the correct source of truth for authorship (see spec §6.2–§6.3, "demote-trick" attack analysis).

### Companion API

```ts
// Also useful: creation timestamp
get createdAt(): number;   // milliseconds since epoch

// Last update timestamp (returns createdAt if no updates)
get lastUpdatedAt(): number;
```

---

## 15. Group Role Mechanics — Slice 3a (verified 2026-05-17)

### Owner role on Group.create

`Group.create({ owner: me })` assigns the creator's account ID the role `"admin"` in the raw group. There is no separate `"writer"` role for the owner. Admins have full write access.

Consequence: after `Group.create({ owner: me })`, calling `group.addMember(me, "writer")` **overwrites** the admin role to writer, downgrading permissions. Do NOT do this for per-author WriteGroups.

### Per-author WriteGroup creation (correct pattern)

```ts
const wg = Group.create({ owner: me });
wg.addMember(conversationGroup, "reader");
// Do NOT add me as "writer" — I am already admin (includes write)
```

### Direct vs inherited members

```ts
// Direct members only (non-inherited):
group.getDirectMembers(): GroupMember[]
// type: { id: string; role: AccountRole; ref: Ref<Account>; account: Account }

// All members including inherited via parent groups:
group.members: GroupMember[]

// Role of a specific account:
group.getRoleOf(accountId): Role | undefined
```

`getDirectMembers()` calls `raw.getMemberKeys()` which filters the group's raw key-value store for keys matching account IDs or agent IDs (starting with `co_` or agent ID format). Inherited accounts from parent groups are excluded.

### Parent group role mapping

`group.getParentGroups()` returns the parent `Group[]` but does NOT include the role-mapping (the "cap" role). To check the parent role, read the raw group:

```ts
const parentKey = `parent_${parentGroup.$jazz.raw.id}`;
const parentRole = group.$jazz.raw.get(parentKey);
// parentRole is one of: "reader" | "writer" | "admin" | "manager" | "extend" | "revoked"
```

This is an internal API path (accessing `$jazz.raw`). If jazz-tools exposes a cleaner method in a future version, prefer that.

### Well-formed WriteGroup validation

A per-author WriteGroup is "well-formed" if:
1. The conversationGroup is a parent with role `"reader"` (cap at reader for inherited members)
2. Exactly one direct admin (the author — who created this WriteGroup and has exclusive write access)
3. No extra direct "writer" accounts (would mean others can write)

```ts
function isWellFormedWriteGroup(group: Group, conversationGroup: Group): boolean {
  // 1. Check parent role
  const parentRole = group.$jazz.raw.get(`parent_${conversationGroup.$jazz.raw.id}`);
  if (parentRole !== "reader") return false;

  // 2. Exactly one direct admin
  const admins = group.getDirectMembers().filter(m => m.role === "admin");
  if (admins.length !== 1) return false;

  // 3. No extra writers
  const writers = group.getDirectMembers().filter(m => m.role === "writer");
  if (writers.length !== 0) return false;

  return true;
}
```

---

## 16. Enumerating My Groups / CoValues (verified 2026-05-19, jazz-tools 0.20.18)

> Survey conducted for Slice 3a Issue 1: Bob's sidebar failing to auto-discover ConversationGroups that Alice created and invited Bob to.

### Question

Does jazz-tools 0.20.18 expose a way to enumerate all CoValues (specifically Groups, or filtered to a given schema type) that the current Account is a member of — without already knowing their IDs?

### Finding: No public enumeration API exists

There is no `useMyGroups()`, `useMyCoValues()`, `allMyGroups()`, `Group.find({ member: me })`, or any indexed query API in jazz-tools 0.20.18.

**What WAS found:**

#### 1. `LocalNode.allCoValues()` — internal, unfiltered

`cojson`'s `LocalNode` (accessible as `me.$jazz.localNode`) exposes:

```ts
allCoValues(): MapIterator<CoValueCore>
```

This returns an iterator over every `CoValueCore` that is currently in the node's in-memory store. It is NOT marked `@internal` in `localNode.d.ts` — the method is public on the class — but it operates on `CoValueCore` (the raw cojson primitive), not jazz-tools schema instances.

**To filter for groups you are a member of** you would need to:

1. Filter to cores whose `verified.header.ruleset.type === "group"` (i.e. `PermissionsDef` of type `"group"`).
2. Reconstruct a `RawGroup` from the core and call `roleOf(myAccountID)` to confirm membership.
3. Map the surviving IDs up through the jazz-tools `Group` class.

**Critical caveats:**

- `allCoValues()` only reflects CoValues that have already been synced/loaded into the in-memory node. It is NOT an exhaustive membership index — it is a snapshot of what is in memory right now. CoValues the peer knows about but has not yet streamed will be absent.
- The iterator returns `CoValueCore` objects, not `RawGroup` or any jazz-tools typed value. Further conversion is needed.
- Relying on this for a UI "conversations list" would be fragile: the set grows over time as the sync server pushes data, with no stable ordering or completion signal.

```ts
// Illustrative (not production-ready) — shows what is technically possible
function getKnownGroupIDs(me: Account): string[] {
  const myID = me.$jazz.raw.id;
  const result: string[] = [];
  for (const core of me.$jazz.localNode.allCoValues()) {
    if (!core.isAvailable()) continue;
    const header = core.verified?.header;
    if (header?.ruleset?.type !== "group") continue;
    // Reconstruct raw group to check role — expensive, requires loading
    result.push(core.id);
  }
  return result;
}
```

#### 2. `Inbox` / `InboxSender` — the recommended jazz pattern

jazz-tools 0.20.18 ships a first-class **Inbox** mechanism, publicly exported from `jazz-tools`:

```ts
import { Inbox, InboxSender } from "jazz-tools";
```

This is designed for exactly the use case of account-to-account CoValue delivery (e.g. "Alice wants to deliver a ConversationGroup ID to Bob"). It is the canonical solution the Jazz team built for this problem.

**`Inbox` — Bob's side (receiver)**

```ts
export declare class Inbox {
  account: Account;
  messages: MessagesStream;
  processed: TxKeyStream;
  failed: FailedMessagesStream;
  root: InboxRoot;

  subscribe<M extends CoValueClassOrSchema, O extends CoValue | undefined>(
    Schema: M,
    callback: (message: InstanceOfSchema<M>, senderAccountID: ID<Account>) => Promise<O | undefined | void>,
    options?: { concurrencyLimit?: number }
  ): () => void;

  static load(account: Account): Promise<Inbox>;
}
```

Bob loads his own inbox and subscribes; the callback fires for each new message with a fully-typed payload.

**`InboxSender` — Alice's side (sender)**

```ts
export declare class InboxSender<I extends CoValue, O extends CoValue | undefined> {
  sendMessage(message: I): Promise<O extends CoValue ? ID<O> : undefined>;
  static load<I extends CoValue, O extends CoValue | undefined = undefined>(
    inboxOwnerID: ID<Account>,
    currentAccount?: Account
  ): Promise<InboxSender<I, O>>;
}
```

Alice loads Bob's inbox sender (using Bob's account ID, which she already knows from the Contact relationship) and sends a message.

**How an Inbox is created:**

The framework reserves `inbox` and `inboxInvite` slots on the default account profile shape:

```ts
// AccountSchema default profile shape includes:
inbox?: string;        // CoID of the inbox root
inboxInvite?: string;  // InboxInvite token for granting send access
```

The `createInboxRoot(account)` helper sets these up:

```ts
import { createInboxRoot } from "jazz-tools";  // exported via internal.js
// (createInboxRoot is not re-exported from the public exports.d.ts;
//  it may be internal — use Inbox.load(account) which creates the root automatically)
```

**`InboxRoot` shape:**

```ts
type InboxRoot = RawCoMap<{
  messages: CoID<MessagesStream>;   // CoStream of message CoIDs
  processed: CoID<TxKeyStream>;     // tracks processed tx keys
  failed: CoID<FailedMessagesStream>;
  inviteLink: InboxInvite;          // `${messagesStreamID}/${inviteSecret}`
}>;
type InboxInvite = `${CoID<MessagesStream>}/${InviteSecret}`;
```

**Concrete usage sketch for Slice 3a:**

```ts
// Alice creates a conversation and wants Bob to discover it
// 1. Alice sends the ConversationGroup CoValue to Bob's inbox
const sender = await InboxSender.load<ConversationGroup>(
  bobContactRef.id,       // Bob's account ID (already in Alice's ContactBook)
  me                      // Alice's account
);
await sender.sendMessage(conversationGroupInstance);

// 2. Bob's app subscribes to his inbox on startup
const inbox = await Inbox.load(me);
const unsub = inbox.subscribe(ConversationGroup, async (convoGroup, senderID) => {
  // convoGroup is a fully-loaded ConversationGroup
  // Update Bob's local contact cache: Contact.linkedConversation = convoGroup.$jazz.id
  const contact = findContactByAccountID(me, senderID);
  if (contact) {
    contact.linkedConversation = convoGroup.$jazz.id;
  }
});
```

### Summary table

| Approach | Available? | Notes |
|---|---|---|
| `useMyGroups()` hook | No | Does not exist |
| `Group.find({ member: me })` | No | No indexed query API |
| `LocalNode.allCoValues()` | Yes (internal) | Unfiltered, in-memory only, returns `CoValueCore` not typed schema instances; fragile for UI use |
| `Inbox` / `InboxSender` | Yes (public) | The canonical jazz solution; designed for exactly this push-notification use case |

### Recommendation for Slice 3a Issue 1

**Use `Inbox` / `InboxSender`.**

The `LocalNode.allCoValues()` path is too fragile for a conversations-list feature: it only covers what has been synced into memory, has no completion signal, and requires low-level `CoValueCore` manipulation. It would produce an incomplete list on cold start and would not react cleanly to new invitations arriving while the app is open.

The `Inbox` pattern is the correct jazz-native solution:

1. **Alice** calls `InboxSender.load(bobID)` and `sendMessage(conversationGroup)` after creating the ConversationGroup and adding Bob as a member.
2. **Bob's app** calls `Inbox.load(me)` at startup and subscribes; the callback fires for each delivered ConversationGroup, at which point Bob can populate `Contact.linkedConversation` and update the sidebar.
3. This correctly handles cold start (the inbox is a persistent CoStream — messages accumulate and are replayed), concurrent devices, and future group conversations beyond 1:1.

The main implementation work is: (a) initialising an Inbox for every new account in `withMigration`, (b) wiring `InboxSender.load` into the conversation-creation flow, and (c) wiring `Inbox.load` + `subscribe` into the app bootstrap (alongside `useAccount`).
