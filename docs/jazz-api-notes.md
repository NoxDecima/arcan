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
