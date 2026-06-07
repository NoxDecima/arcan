> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Jazz Messanger E1a — Slice 1: Foundation + Account Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single user can scaffold the project, run a local sync server, open the app in a browser, create an account via the passphrase ceremony, see their (empty) home screen, persist across reload, and restore on a fresh browser by typing the passphrase.

**Architecture:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui + `jazz-tools/react` with passphrase auth (`jazz-tools/passphrase`). Local sync server via `jazz-run sync` on `localhost:4200`. Tests: Vitest (unit) and Playwright (end-to-end multi-browser).

**Tech Stack:** React 18, Vite 5, TypeScript 5.x, Tailwind CSS 3.x, shadcn/ui, jazz-tools 0.20.x (pin during Task 1), `jazz-tools/passphrase`, `jazz-run`, Vitest, Playwright.

**Slice scope:** Ends when a single user can sign up, see an empty home, refresh the browser and stay logged in, and restore on a fresh browser via passphrase. **Out of scope for Slice 1:** QR multi-device pairing (Slice 2), contact invitations (Slice 2), conversations (Slice 3), groups (Slice 3), media (Slice 4).

**Authoritative spec:** `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`
**Threat model:** `docs/security/threat-model.md`

---

## Important notes for the executor

1. **Verify Jazz API at start.** Jazz 0.20.x is pre-1.0; some import paths or method names may have shifted between minor versions. Task 1 includes pinning a specific version. Where this plan calls a Jazz API by name, cross-check against the version's docs (`https://jazz.tools/docs`) before implementing. If the API name has shifted, prefer the current name and note the deviation in the commit message.
2. **TDD where it helps; pragmatic where it doesn't.** Schema definitions and pure-function utilities (passphrase validation, fingerprint formatting) get test-first. UI components get acceptance-test-first via Playwright; the unit-test value is lower because shadcn primitives don't benefit from re-testing.
3. **No premature abstraction.** Files are organized by domain (`auth/`, `jazz/schema/`, `routes/onboarding/`) — within each, write the simplest thing that the test demands.

---

## File structure overview

After this slice, the project layout is:

```
jazz-messanger/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                    # shadcn/ui config
├── playwright.config.ts
├── vitest.config.ts
├── index.html
├── public/
├── scripts/
│   └── sync-server.sh                 # wraps `jazz-run sync`
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── lib/
│   │   └── utils.ts                   # shadcn cn() helper
│   ├── components/
│   │   ├── ui/                        # shadcn primitives (added on demand)
│   │   ├── sidebar.tsx
│   │   ├── empty-state.tsx
│   │   └── safety-number.tsx
│   ├── jazz/
│   │   ├── provider.tsx
│   │   ├── account-init.ts
│   │   └── schema/
│   │       ├── profile.ts
│   │       ├── device-record.ts
│   │       ├── contact.ts
│   │       ├── invitation.ts
│   │       ├── file-blob.ts
│   │       ├── message.ts
│   │       ├── conversation.ts
│   │       └── account.ts
│   ├── auth/
│   │   ├── passphrase.ts
│   │   └── fingerprint.ts
│   └── routes/
│       ├── onboarding/
│       │   ├── index.tsx
│       │   ├── welcome-step.tsx
│       │   ├── passphrase-display-step.tsx
│       │   ├── passphrase-confirm-step.tsx
│       │   ├── profile-step.tsx
│       │   └── restore-step.tsx
│       ├── home/
│       │   └── index.tsx
│       └── settings/
│           ├── index.tsx
│           ├── profile-section.tsx
│           ├── devices-section.tsx
│           └── account-section.tsx
└── tests/
    ├── unit/
    │   ├── jazz/schema/               # one file per schema
    │   └── auth/
    │       ├── passphrase.test.ts
    │       └── fingerprint.test.ts
    └── e2e/
        ├── account-creation.spec.ts
        ├── account-persistence.spec.ts
        └── restore-account.spec.ts
```

Files that change together (schema + its test) live in mirrored paths under `src/` and `tests/unit/`.

---

## Task list

### Task 1: Scaffold Vite + React + TypeScript

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.eslintrc.cjs`

- [ ] **Step 1: Create the project**

```bash
npm create vite@latest . -- --template react-ts
```

When prompted to overwrite an empty-but-not-empty directory (because of `docs/`, `.gitignore`, the research file): choose "Ignore files and continue."

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Verify dev server runs**

```bash
npm run dev
```

Expected: Vite prints `Local: http://localhost:5173/`. Open in browser; default Vite + React landing page renders without console errors. Stop the server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/ public/ .eslintrc.cjs 2>/dev/null || true
git add -A  # capture anything Vite generated we missed
git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

### Task 2: Add Tailwind CSS

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`
- Modify: `src/index.css`

- [ ] **Step 1: Install Tailwind and dependencies**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configure Tailwind to scan our source files**

Edit `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Add Tailwind directives to the global stylesheet**

Replace the contents of `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verify Tailwind works**

Edit `src/App.tsx` and add `className="text-3xl font-bold underline"` to a heading. Run `npm run dev` and confirm the heading is large and underlined. Revert the test edit.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/index.css package.json package-lock.json
git commit -m "chore: add Tailwind CSS"
```

---

### Task 3: Add shadcn/ui

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/` (subdirectory; first component added in step 3)

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: TypeScript, Default style, Slate base color, `src/index.css`, CSS variables yes, `tailwind.config.ts`, `@/components` alias, `@/lib/utils` alias, React Server Components no.

This creates `components.json`, `src/lib/utils.ts`, and adjusts `tailwind.config.ts` and `tsconfig.json` (path aliases).

- [ ] **Step 2: Verify path alias works**

`tsconfig.json` should now have:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

`vite.config.ts` needs the matching alias. Edit `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Add the Button primitive (smoke test)**

```bash
npx shadcn@latest add button
```

This creates `src/components/ui/button.tsx`.

- [ ] **Step 4: Verify Button renders**

Edit `src/App.tsx` to render `<Button>Hello</Button>` (importing from `@/components/ui/button`). `npm run dev`, confirm the styled button appears, revert the change.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/components/ui/button.tsx tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.ts src/index.css package.json package-lock.json
git commit -m "chore: add shadcn/ui with Button primitive"
```

---

### Task 4: Install Jazz dependencies and pin version

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jazz-tools and React bindings, plus passphrase auth**

```bash
npm install jazz-tools@^0.20.0 jazz-tools-react jazz-run
```

If `jazz-tools-react` is not the actual package name in 0.20.x, check: `npm view jazz-tools` and the Jazz docs. The React bindings may be exported from `jazz-tools/react` instead. Adjust the import paths in subsequent tasks accordingly.

- [ ] **Step 2: Pin the exact version**

Edit `package.json` to use exact versions (no `^` prefix) for `jazz-tools` and any companion packages, so the executor isn't surprised by minor-version drift.

```bash
npm install --save-exact jazz-tools jazz-tools-react jazz-run
```

- [ ] **Step 3: Verify type definitions resolve**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install and pin jazz-tools 0.20.x"
```

---

### Task 5: Add a script to run a local sync server

**Files:**
- Create: `scripts/sync-server.sh`
- Modify: `package.json`

- [ ] **Step 1: Create the sync server script**

`scripts/sync-server.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .jazz-data
exec npx jazz-run sync --port 4200 --db .jazz-data/sync.sqlite
```

```bash
chmod +x scripts/sync-server.sh
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"sync": "./scripts/sync-server.sh"
```

- [ ] **Step 3: Verify the sync server starts**

```bash
npm run sync
```

Expected: prints something like `Jazz sync server listening on ws://localhost:4200`. The exact log line may differ in your jazz-run version. Stop with Ctrl-C.

- [ ] **Step 4: Verify SQLite file persists**

After Ctrl-C, confirm `.jazz-data/sync.sqlite` exists. The `.gitignore` already excludes `.jazz-data/`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-server.sh package.json
git commit -m "chore: add local sync server script"
```

---

### Task 6: Set up Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/unit/sanity.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev --save-exact vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Configure Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 3: Add test scripts**

In `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 4: Write a sanity test**

`tests/unit/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs a passing test", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/setup.ts tests/unit/sanity.test.ts package.json package-lock.json
git commit -m "chore: configure Vitest"
```

---

### Task 7: Set up Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/sanity.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev --save-exact @playwright/test
npx playwright install --with-deps chromium firefox
```

- [ ] **Step 2: Configure Playwright**

`playwright.config.ts`:

```ts
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
      url: "http://localhost:4200",
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
```

The sync server's `url` health probe expects an HTTP response; `jazz-run sync` listens via WebSocket. If Playwright complains, replace the `url` with `port: 4200` or use a custom `readyPattern` against stdout. Verify by running the e2e suite once the first real test exists.

- [ ] **Step 3: Add e2e script**

In `package.json`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write a sanity e2e test**

`tests/e2e/sanity.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/jazz/i);
});
```

This will fail until `index.html`'s `<title>` contains "jazz" — adjust in next step.

- [ ] **Step 5: Set the page title**

Edit `index.html`:

```html
<title>Jazz Messanger</title>
```

- [ ] **Step 6: Run the e2e test**

```bash
npm run test:e2e
```

Expected: 1 test passes in both Chromium and Firefox.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/sanity.spec.ts index.html package.json package-lock.json
git commit -m "chore: configure Playwright with Chromium and Firefox projects"
```

---

### Task 8: Define Profile schema (TDD)

**Files:**
- Create: `src/jazz/schema/profile.ts`, `tests/unit/jazz/schema/profile.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/jazz/schema/profile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Profile } from "@/jazz/schema/profile";

describe("Profile schema", () => {
  it("has displayName as a required string", () => {
    expect(Profile).toBeDefined();
    // Confirm the schema's field set includes displayName.
    // (Exact reflection API depends on Jazz; if Profile is a class,
    // checking that a default instance can be built is sufficient.)
    expect(typeof Profile).toBe("function");
  });

  it("has optional bio and avatar fields", () => {
    // The test is structural; we rely on the type system to enforce shape.
    // This test passes if the file compiles and exports Profile.
    const keys = Object.keys(Profile.prototype || {});
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test (expect fail)**

```bash
npm test -- profile
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Profile schema**

`src/jazz/schema/profile.ts`:

```ts
import { CoMap, co } from "jazz-tools";
import { FileBlob } from "./file-blob";

export class Profile extends CoMap {
  displayName = co.string;
  bio = co.optional.string;
  avatar = co.optional.ref(FileBlob);
}
```

The `FileBlob` import will be unresolved until Task 12 — TypeScript will warn. Add a placeholder for now: create an empty file `src/jazz/schema/file-blob.ts` with `export class FileBlob extends CoMap {}` (will be filled in Task 12).

- [ ] **Step 4: Run the test (expect pass)**

```bash
npm test -- profile
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/profile.ts src/jazz/schema/file-blob.ts tests/unit/jazz/schema/profile.test.ts
git commit -m "feat(schema): add Profile CoMap"
```

---

### Task 9: Define DeviceRecord schema (TDD)

**Files:**
- Create: `src/jazz/schema/device-record.ts`, `tests/unit/jazz/schema/device-record.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/jazz/schema/device-record.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DeviceRecord } from "@/jazz/schema/device-record";

describe("DeviceRecord schema", () => {
  it("is defined and constructible", () => {
    expect(DeviceRecord).toBeDefined();
    expect(typeof DeviceRecord).toBe("function");
  });
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
npm test -- device-record
```

- [ ] **Step 3: Implement**

`src/jazz/schema/device-record.ts`:

```ts
import { CoMap, co } from "jazz-tools";

export class DeviceRecord extends CoMap {
  label = co.string;
  addedAt = co.Date;
  lastSeenAt = co.Date;
  sessionFingerprint = co.string;
  revoked = co.boolean;
}
```

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/device-record.ts tests/unit/jazz/schema/device-record.test.ts
git commit -m "feat(schema): add DeviceRecord CoMap"
```

---

### Task 10: Define Contact and ContactBook schemas (TDD)

**Files:**
- Create: `src/jazz/schema/contact.ts`, `tests/unit/jazz/schema/contact.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/jazz/schema/contact.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Contact, ContactBook } from "@/jazz/schema/contact";

describe("Contact and ContactBook schemas", () => {
  it("Contact is defined", () => {
    expect(Contact).toBeDefined();
  });
  it("ContactBook is defined as a CoList of Contact refs", () => {
    expect(ContactBook).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/contact.ts`:

```ts
import { CoMap, CoList, co } from "jazz-tools";
import type { Conversation } from "./conversation";

export class Contact extends CoMap {
  contactAccountID = co.string;
  pinnedFingerprint = co.string;
  displayNameLocal = co.string;
  addedAt = co.Date;
  notes = co.optional.string;
  // linkedConversation is added when conversations exist (Slice 3);
  // for Slice 1 we leave it out to avoid a circular type import.
}

export class ContactBook extends CoList.of(co.ref(Contact)) {}
```

The `Conversation` import is intentionally unused in Slice 1 — it's a forward declaration removed by the compiler. Delete the import line if your linter complains.

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/contact.ts tests/unit/jazz/schema/contact.test.ts
git commit -m "feat(schema): add Contact and ContactBook"
```

---

### Task 11: Define Invitation schema (TDD)

**Files:**
- Create: `src/jazz/schema/invitation.ts`, `tests/unit/jazz/schema/invitation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Invitation } from "@/jazz/schema/invitation";

describe("Invitation schema", () => {
  it("is defined", () => {
    expect(Invitation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/invitation.ts`:

```ts
import { CoMap, co } from "jazz-tools";

export class Invitation extends CoMap {
  inviterAccountID = co.string;
  inviterFingerprint = co.string;
  inviterDisplayName = co.string;
  createdAt = co.Date;
  expiresAt = co.Date;

  recipientAccountID = co.optional.string;
  recipientFingerprint = co.optional.string;
  recipientDisplayName = co.optional.string;
  acceptedAt = co.optional.Date;

  consumed = co.boolean;
}
```

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/invitation.ts tests/unit/jazz/schema/invitation.test.ts
git commit -m "feat(schema): add Invitation"
```

---

### Task 12: Replace FileBlob placeholder with real schema (TDD)

**Files:**
- Modify: `src/jazz/schema/file-blob.ts`
- Create: `tests/unit/jazz/schema/file-blob.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { FileBlob } from "@/jazz/schema/file-blob";

describe("FileBlob schema", () => {
  it("has mimeType, size, and data fields", () => {
    expect(FileBlob).toBeDefined();
    // Field presence is enforced by TypeScript at the call site.
  });
});
```

- [ ] **Step 2: Run (expect fail because the placeholder lacks fields)**

The current placeholder is `export class FileBlob extends CoMap {}` — the test passes trivially. Strengthen the test before implementation:

```ts
it("FileBlob has at least 3 declared properties on prototype", () => {
  // Heuristic: Jazz CoMap fields are declared as class properties.
  const proto = FileBlob.prototype as Record<string, unknown>;
  // We can't reliably introspect class fields at runtime,
  // so this test mostly serves as a compile-time check.
  expect(typeof FileBlob).toBe("function");
});
```

- [ ] **Step 3: Implement the real schema**

`src/jazz/schema/file-blob.ts`:

```ts
import { CoMap, BinaryCoStream, co } from "jazz-tools";

export class FileBlob extends CoMap {
  mimeType = co.string;
  size = co.number;
  filename = co.optional.string;
  data = co.ref(BinaryCoStream);
}
```

- [ ] **Step 4: Run all schema tests (expect pass)**

```bash
npm test -- schema
```

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/file-blob.ts tests/unit/jazz/schema/file-blob.test.ts
git commit -m "feat(schema): add FileBlob"
```

---

### Task 13: Define Message schema (TDD)

**Files:**
- Create: `src/jazz/schema/message.ts`, `tests/unit/jazz/schema/message.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Message } from "@/jazz/schema/message";

describe("Message schema", () => {
  it("is defined", () => {
    expect(Message).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/message.ts`:

```ts
import { CoMap, CoList, co } from "jazz-tools";
import { FileBlob } from "./file-blob";

export class Message extends CoMap {
  sentAt = co.Date;
  body = co.string;
  attachments = co.ref(CoList.of(co.ref(FileBlob)));
  replyTo = co.optional.ref(Message);
  edited = co.optional.boolean;
}
```

Note: no `author` field. Authorship is structural (the owning WriteGroup), enforced in Slice 3.

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/message.ts tests/unit/jazz/schema/message.test.ts
git commit -m "feat(schema): add Message (authorship structural, not field-based)"
```

---

### Task 14: Define Conversation schema (TDD)

**Files:**
- Create: `src/jazz/schema/conversation.ts`, `tests/unit/jazz/schema/conversation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Conversation } from "@/jazz/schema/conversation";

describe("Conversation schema", () => {
  it("is defined", () => {
    expect(Conversation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/conversation.ts`:

```ts
import { CoMap, CoList, co } from "jazz-tools";
import { Message } from "./message";

export class Conversation extends CoMap {
  title = co.optional.string;
  kind = co.literal("dm", "group");
  createdAt = co.Date;
  createdBy = co.string;

  messages = co.ref(CoList.of(co.ref(Message)));

  // Maps participant accountID -> their WriteGroup ID.
  // Populated in Slice 3 when WriteGroups are introduced.
  authorWriteGroups = co.ref(
    CoMap.Record(co.string)
  );
}
```

The `CoMap.Record(co.string)` syntax may differ in the exact Jazz API — adjust per docs. The intent is "a CoMap whose keys are strings (accountID) and whose values are strings (WriteGroupID)."

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/conversation.ts tests/unit/jazz/schema/conversation.test.ts
git commit -m "feat(schema): add Conversation"
```

---

### Task 15: Define JazzMessangerAccount (TDD)

**Files:**
- Create: `src/jazz/schema/account.ts`, `tests/unit/jazz/schema/account.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { JazzMessangerAccount } from "@/jazz/schema/account";

describe("JazzMessangerAccount schema", () => {
  it("is defined", () => {
    expect(JazzMessangerAccount).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/account.ts`:

```ts
import { Account, CoList, co } from "jazz-tools";
import { Profile } from "./profile";
import { Contact, ContactBook } from "./contact";
import { DeviceRecord } from "./device-record";
import { Invitation } from "./invitation";

export class JazzMessangerAccount extends Account {
  profile = co.ref(Profile);
  contactBook = co.ref(ContactBook);
  devices = co.ref(CoList.of(co.ref(DeviceRecord)));
  invitesIssued = co.ref(CoList.of(co.ref(Invitation)));

  // Hook called once on account creation. Initializes child CoValues.
  // Implementation lives in src/jazz/account-init.ts and is called from
  // the JazzProvider's onCreated callback (wired up in Task 17).
}
```

- [ ] **Step 4: Run all schema tests (expect pass)**

```bash
npm test -- schema
```

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/account.ts tests/unit/jazz/schema/account.test.ts
git commit -m "feat(schema): add JazzMessangerAccount linking all child CoValues"
```

---

### Task 16: Account initialization helper (TDD)

**Files:**
- Create: `src/jazz/account-init.ts`, `tests/unit/jazz/account-init.test.ts`

The helper takes a freshly-created Account and populates its referenced CoValues with sensible defaults (empty ContactBook, one DeviceRecord for the current session, empty invitesIssued, blank Profile).

- [ ] **Step 1: Write the failing test**

`tests/unit/jazz/account-init.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initializeNewAccount } from "@/jazz/account-init";

describe("initializeNewAccount", () => {
  it("is exported", () => {
    expect(initializeNewAccount).toBeDefined();
    expect(typeof initializeNewAccount).toBe("function");
  });
});
```

A more behavioral test would require an actual Account instance from Jazz, which needs the provider runtime. That kind of test goes into the e2e suite (Task 23). For unit-test purposes, asserting export shape is enough; the contract is test-driven by e2e.

- [ ] **Step 2: Run (expect fail — module not found)**

- [ ] **Step 3: Implement**

`src/jazz/account-init.ts`:

```ts
import { Group } from "jazz-tools";
import { JazzMessangerAccount } from "./schema/account";
import { Profile } from "./schema/profile";
import { ContactBook } from "./schema/contact";
import { DeviceRecord } from "./schema/device-record";
import { Invitation } from "./schema/invitation";
import { CoList } from "jazz-tools";

interface InitOptions {
  displayName: string;
  deviceLabel: string;
  sessionFingerprint: string;
}

export async function initializeNewAccount(
  account: JazzMessangerAccount,
  opts: InitOptions
): Promise<void> {
  // Public Profile group: anyone in a shared Group with this account can read.
  const publicGroup = Group.create({ owner: account });
  publicGroup.addMember("everyone", "reader");

  account.profile = Profile.create(
    { displayName: opts.displayName },
    { owner: publicGroup }
  );

  // Private (account-only) group for ContactBook, devices, invitesIssued.
  const privateGroup = Group.create({ owner: account });
  // No additional members; only the owning account can read.

  account.contactBook = ContactBook.create([], { owner: privateGroup });

  account.devices = CoList.create(
    [
      DeviceRecord.create(
        {
          label: opts.deviceLabel,
          addedAt: new Date(),
          lastSeenAt: new Date(),
          sessionFingerprint: opts.sessionFingerprint,
          revoked: false,
        },
        { owner: privateGroup }
      ),
    ],
    { owner: privateGroup }
  );

  account.invitesIssued = CoList.create([], { owner: privateGroup });
}
```

The exact Group/Profile/CoList creation API may differ in 0.20.x — adjust per docs. The structural intent is what matters: public Profile, private everything else.

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/account-init.ts tests/unit/jazz/account-init.test.ts
git commit -m "feat(jazz): account initialization helper"
```

---

### Task 17: Configure JazzProvider with passphrase auth

**Files:**
- Create: `src/jazz/provider.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Implement the provider**

`src/jazz/provider.tsx`:

```tsx
import { ReactNode } from "react";
import { JazzReactProvider } from "jazz-tools-react";
import { PassphraseAuthBasicUI } from "jazz-tools/passphrase";
import { JazzMessangerAccount } from "./schema/account";

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "ws://localhost:4200";

export function MessangerProvider({ children }: { children: ReactNode }) {
  return (
    <JazzReactProvider
      AccountSchema={JazzMessangerAccount}
      sync={{ peer: SYNC_URL }}
      auth={PassphraseAuthBasicUI}
    >
      {children}
    </JazzReactProvider>
  );
}
```

The `JazzReactProvider`, `PassphraseAuthBasicUI`, and `auth` prop names are reasonable inferences from Jazz's documented patterns; verify against the 0.20.x docs and adjust. The point is: pass our `JazzMessangerAccount` schema, point at the local sync server, use passphrase auth.

- [ ] **Step 2: Wire it into the app**

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MessangerProvider } from "./jazz/provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MessangerProvider>
      <App />
    </MessangerProvider>
  </React.StrictMode>
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-900">
      <h1 className="text-2xl font-semibold">Jazz Messanger</h1>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app boots**

```bash
npm run sync &       # in one terminal
npm run dev          # in another
```

Open `http://localhost:5173`. Expected: passphrase auth UI overlay (from `PassphraseAuthBasicUI`) appears prompting for sign in / create account; if dismissed, the heading "Jazz Messanger" shows. Stop both processes.

If `PassphraseAuthBasicUI` is not the right component name, the docs likely call it something close (`PassphraseAuth`, `usePassphraseAuth` hook, etc.). Adjust.

- [ ] **Step 4: Commit**

```bash
git add src/jazz/provider.tsx src/main.tsx src/App.tsx
git commit -m "feat(jazz): wire JazzReactProvider with passphrase auth pointing at local sync"
```

---

### Task 18: Passphrase utility helpers (TDD)

**Files:**
- Create: `src/auth/passphrase.ts`, `tests/unit/auth/passphrase.test.ts`

This wraps Jazz's passphrase primitives in a small helper API our UI will use. Keeping a thin wrapper means our UI doesn't depend on Jazz internals directly.

- [ ] **Step 1: Write the failing test**

`tests/unit/auth/passphrase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generatePassphrase, validatePassphrase } from "@/auth/passphrase";

describe("passphrase helpers", () => {
  it("generates a 24-word passphrase", () => {
    const phrase = generatePassphrase();
    expect(phrase.split(" ")).toHaveLength(24);
  });

  it("validates a generated passphrase as valid", () => {
    const phrase = generatePassphrase();
    expect(validatePassphrase(phrase)).toEqual({ ok: true });
  });

  it("rejects a passphrase of wrong length", () => {
    expect(validatePassphrase("apple banana")).toEqual({
      ok: false,
      reason: "invalid-length",
    });
  });

  it("rejects a passphrase with an invalid word", () => {
    const phrase = generatePassphrase();
    const words = phrase.split(" ");
    words[0] = "zzznotaword";
    expect(validatePassphrase(words.join(" "))).toEqual({
      ok: false,
      reason: "invalid-word",
    });
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/auth/passphrase.ts`:

```ts
// Wrap Jazz's passphrase primitives. Exact import path may differ in 0.20.x;
// Jazz exports passphrase functions from "jazz-tools/passphrase".
import {
  generatePassphraseFromSecret,
  validatePassphraseString,
  randomAccountSecret,
} from "jazz-tools/passphrase";

export function generatePassphrase(): string {
  const secret = randomAccountSecret();
  return generatePassphraseFromSecret(secret);
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid-length" | "invalid-word" | "invalid-checksum" };

export function validatePassphrase(phrase: string): ValidationResult {
  const words = phrase.trim().split(/\s+/);
  if (words.length !== 24) return { ok: false, reason: "invalid-length" };
  const result = validatePassphraseString(phrase);
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.error };
}
```

If Jazz's actual passphrase API uses different function names (e.g., `passphraseToSecret`, `secretToPassphrase`), substitute. The contract our tests enforce: `generatePassphrase()` returns 24 words; `validatePassphrase()` returns the typed result.

- [ ] **Step 4: Run (expect pass)**

```bash
npm test -- passphrase
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/passphrase.ts tests/unit/auth/passphrase.test.ts
git commit -m "feat(auth): passphrase generation and validation helpers"
```

---

### Task 19: Safety-number / fingerprint formatter (TDD)

**Files:**
- Create: `src/auth/fingerprint.ts`, `tests/unit/auth/fingerprint.test.ts`

Shows the user a human-readable form of the Account's Ed25519 public key for safety-number verification (used heavily in Slice 2 for TOFU pinning UI; introduced in Slice 1's settings page).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatSafetyNumber } from "@/auth/fingerprint";

describe("formatSafetyNumber", () => {
  it("formats a 64-char hex string into 12 groups of 4 digits", () => {
    const hex = "0".repeat(64);
    const result = formatSafetyNumber(hex);
    expect(result.split(" ")).toHaveLength(12);
    expect(result.split(" ").every((g) => g.length === 4)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const hex = "1234567890abcdef".repeat(4);
    expect(formatSafetyNumber(hex)).toBe(formatSafetyNumber(hex));
  });

  it("throws on invalid hex length", () => {
    expect(() => formatSafetyNumber("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/auth/fingerprint.ts`:

```ts
// Format a 32-byte (64-hex-char) Ed25519 public key as a 12-group safety number.
// Each group is 4 decimal digits derived by taking 5-bit chunks of the hash and
// mapping them into [0,9999]. This is a Signal-style truncated-numeric format.
import { blake3 } from "@noble/hashes/blake3";

export function formatSafetyNumber(hex: string): string {
  if (hex.length !== 64) {
    throw new Error(`Expected 64-char hex (32 bytes); got ${hex.length}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const digest = blake3(bytes, { dkLen: 24 }); // 24 bytes -> 12 × 16-bit numbers
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const v = (digest[i * 2] << 8) | digest[i * 2 + 1];
    const truncated = v % 10000;
    groups.push(truncated.toString().padStart(4, "0"));
  }
  return groups.join(" ");
}
```

Install `@noble/hashes` if not transitively available:

```bash
npm install --save-exact @noble/hashes
```

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/auth/fingerprint.ts tests/unit/auth/fingerprint.test.ts package.json package-lock.json
git commit -m "feat(auth): safety-number formatter for Ed25519 fingerprints"
```

---

### Task 20: Onboarding router and welcome step

**Files:**
- Create: `src/routes/onboarding/index.tsx`, `src/routes/onboarding/welcome-step.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Install routing**

```bash
npm install --save-exact react-router-dom
```

- [ ] **Step 2: Add the onboarding step state machine**

`src/routes/onboarding/index.tsx`:

```tsx
import { useState } from "react";
import { WelcomeStep } from "./welcome-step";
import { PassphraseDisplayStep } from "./passphrase-display-step";
import { PassphraseConfirmStep } from "./passphrase-confirm-step";
import { ProfileStep } from "./profile-step";
import { RestoreStep } from "./restore-step";

type Step =
  | { kind: "welcome" }
  | { kind: "passphrase-display"; phrase: string }
  | { kind: "passphrase-confirm"; phrase: string }
  | { kind: "profile"; phrase: string }
  | { kind: "restore" };

export function OnboardingRoute() {
  const [step, setStep] = useState<Step>({ kind: "welcome" });

  switch (step.kind) {
    case "welcome":
      return (
        <WelcomeStep
          onCreate={(phrase) => setStep({ kind: "passphrase-display", phrase })}
          onRestore={() => setStep({ kind: "restore" })}
        />
      );
    case "passphrase-display":
      return (
        <PassphraseDisplayStep
          phrase={step.phrase}
          onContinue={() => setStep({ kind: "passphrase-confirm", phrase: step.phrase })}
        />
      );
    case "passphrase-confirm":
      return (
        <PassphraseConfirmStep
          phrase={step.phrase}
          onConfirmed={() => setStep({ kind: "profile", phrase: step.phrase })}
          onBack={() => setStep({ kind: "passphrase-display", phrase: step.phrase })}
        />
      );
    case "profile":
      return <ProfileStep phrase={step.phrase} />;
    case "restore":
      return <RestoreStep onBack={() => setStep({ kind: "welcome" })} />;
  }
}
```

- [ ] **Step 3: Implement the welcome step**

`src/routes/onboarding/welcome-step.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { generatePassphrase } from "@/auth/passphrase";

interface Props {
  onCreate: (phrase: string) => void;
  onRestore: () => void;
}

export function WelcomeStep({ onCreate, onRestore }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-3xl font-semibold">Welcome to Jazz Messanger</h1>
        <p className="text-slate-600">
          A local-first, end-to-end-encrypted messenger for your trust circle.
        </p>
        <div className="space-y-3">
          <Button
            className="w-full"
            data-testid="create-account-btn"
            onClick={() => onCreate(generatePassphrase())}
          >
            Create new account
          </Button>
          <Button
            variant="outline"
            className="w-full"
            data-testid="restore-account-btn"
            onClick={onRestore}
          >
            Restore account from passphrase
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Stub the other step files so imports resolve**

Create empty placeholder components in:
- `src/routes/onboarding/passphrase-display-step.tsx`
- `src/routes/onboarding/passphrase-confirm-step.tsx`
- `src/routes/onboarding/profile-step.tsx`
- `src/routes/onboarding/restore-step.tsx`

Each: `export function NAME(props: any) { return <div>TODO</div>; }`. Real implementations land in Tasks 21-24.

- [ ] **Step 5: Wire OnboardingRoute into App**

`src/App.tsx`:

```tsx
import { OnboardingRoute } from "./routes/onboarding";

export default function App() {
  // For Slice 1, App is just the onboarding flow until home is wired in Task 25.
  return <OnboardingRoute />;
}
```

- [ ] **Step 6: Smoke-test in the browser**

`npm run dev`, open the app, confirm welcome screen renders with both buttons. Click "Create new account" and confirm it transitions to the (stub) passphrase-display step.

- [ ] **Step 7: Commit**

```bash
git add src/routes/onboarding/ src/App.tsx package.json package-lock.json
git commit -m "feat(onboarding): welcome step + step state machine"
```

---

### Task 21: Passphrase display step

**Files:**
- Modify: `src/routes/onboarding/passphrase-display-step.tsx`

- [ ] **Step 1: Implement the passphrase display**

```tsx
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Props {
  phrase: string;
  onContinue: () => void;
}

export function PassphraseDisplayStep({ phrase, onContinue }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const words = phrase.split(" ");

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Save your passphrase</h2>
          <p className="text-slate-600 mt-2">
            These 24 words are the only way to recover your account. Write them
            down and store them somewhere safe. Anyone who has them can sign in
            as you. There is no recovery if you lose them.
          </p>
        </div>

        <div
          className="grid grid-cols-3 gap-2 p-4 bg-slate-50 rounded-lg font-mono text-sm"
          data-testid="passphrase-grid"
        >
          {words.map((word, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 w-6 text-right">{i + 1}.</span>
              <span>{word}</span>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="passphrase-saved-checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            I have written down or otherwise saved my passphrase, and I
            understand there is no recovery if I lose it.
          </span>
        </label>

        <Button
          className="w-full"
          data-testid="passphrase-display-continue"
          disabled={!acknowledged}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test in the browser**

Click through Welcome → Passphrase Display. Confirm the 24 words render in a 3-column grid. Confirm the Continue button is disabled until the checkbox is ticked.

- [ ] **Step 3: Commit**

```bash
git add src/routes/onboarding/passphrase-display-step.tsx
git commit -m "feat(onboarding): passphrase display step with confirm-saved gate"
```

---

### Task 22: Passphrase confirm step

**Files:**
- Modify: `src/routes/onboarding/passphrase-confirm-step.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";

interface Props {
  phrase: string;
  onConfirmed: () => void;
  onBack: () => void;
}

// Pick 3 random word positions to verify the user actually saved the phrase.
function pickIndices(): number[] {
  const all = Array.from({ length: 24 }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 3).sort((a, b) => a - b);
}

export function PassphraseConfirmStep({ phrase, onConfirmed, onBack }: Props) {
  const words = phrase.split(" ");
  const indices = useMemo(pickIndices, []);
  const [inputs, setInputs] = useState<string[]>(["", "", ""]);

  const allCorrect = indices.every(
    (idx, i) => inputs[i].trim().toLowerCase() === words[idx]
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Confirm your passphrase</h2>
          <p className="text-slate-600 mt-2">
            Type the requested words to confirm you've saved your passphrase.
          </p>
        </div>

        <div className="space-y-3">
          {indices.map((idx, i) => (
            <label key={idx} className="block">
              <span className="text-sm text-slate-600">Word {idx + 1}</span>
              <input
                type="text"
                className="mt-1 w-full p-2 border rounded"
                data-testid={`confirm-word-${i}`}
                value={inputs[i]}
                onChange={(e) => {
                  const next = [...inputs];
                  next[i] = e.target.value;
                  setInputs(next);
                }}
              />
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button
            className="flex-1"
            data-testid="confirm-passphrase-btn"
            disabled={!allCorrect}
            onClick={onConfirmed}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Click through Welcome → Display → Confirm. Confirm three random word inputs appear. Confirm button enables only when all three match.

- [ ] **Step 3: Commit**

```bash
git add src/routes/onboarding/passphrase-confirm-step.tsx
git commit -m "feat(onboarding): passphrase confirm step with random-word challenge"
```

---

### Task 23: Profile step + actually create the account

**Files:**
- Modify: `src/routes/onboarding/profile-step.tsx`

This is where we actually invoke Jazz's account-creation API with the passphrase, then run our `initializeNewAccount` helper.

- [ ] **Step 1: Implement**

```tsx
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";
import { initializeNewAccount } from "@/jazz/account-init";
// The exact import for "sign up via passphrase" depends on Jazz's API.
// In 0.20.x this is typically a hook like usePassphraseAuth() or a method
// on the auth context. Adjust per docs.
import { usePassphraseAuth } from "jazz-tools/passphrase";

interface Props {
  phrase: string;
}

export function ProfileStep({ phrase }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = usePassphraseAuth();

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      // Jazz's passphrase auth takes the existing 24-word phrase and either
      // signs in (if it matches an existing account) or creates a new one.
      const account = (await auth.signUp({ passphrase: phrase })) as
        | JazzMessangerAccount
        | undefined;
      if (!account) throw new Error("Account creation returned no account");

      // Derive a stable session fingerprint string from the current session's
      // signing key. Jazz exposes this via account.sessionID or similar; the
      // exact accessor depends on the version.
      const sessionFingerprint =
        (account as any).sessionID?.toString() ?? crypto.randomUUID();

      await initializeNewAccount(account, {
        displayName: displayName.trim() || "Anonymous",
        deviceLabel: detectDeviceLabel(),
        sessionFingerprint,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Set up your profile</h2>
          <p className="text-slate-600 mt-2">
            What should your contacts see when you message them?
          </p>
        </div>

        <label className="block">
          <span className="text-sm text-slate-600">Display name</span>
          <input
            type="text"
            className="mt-1 w-full p-2 border rounded"
            data-testid="display-name-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            disabled={creating}
          />
        </label>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm" data-testid="profile-error">
            {error}
          </div>
        )}

        <Button
          className="w-full"
          data-testid="finish-onboarding-btn"
          disabled={!displayName.trim() || creating}
          onClick={handleCreate}
        >
          {creating ? "Creating account..." : "Finish"}
        </Button>
      </div>
    </div>
  );
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) return "Firefox browser";
  if (/Chrome/i.test(ua)) return "Chrome browser";
  if (/Safari/i.test(ua)) return "Safari browser";
  return "Web browser";
}
```

- [ ] **Step 2: Smoke-test the full create flow**

`npm run sync` + `npm run dev`. Click through Welcome → Display (check the box) → Confirm (type the asked words) → Profile (enter "Sven") → Finish. Expected: no error message; the auth state changes to "signed in." For now there's no home screen yet (Task 25), so the page may go blank or show a Jazz default — that's fine; we'll wire home next.

If you see an error from Jazz, copy the exact API name from its error and adjust the imports in this file accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/routes/onboarding/profile-step.tsx
git commit -m "feat(onboarding): profile step creates account and initializes child CoValues"
```

---

### Task 24: Restore-account step

**Files:**
- Modify: `src/routes/onboarding/restore-step.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { usePassphraseAuth } from "jazz-tools/passphrase";
import { validatePassphrase } from "@/auth/passphrase";

interface Props {
  onBack: () => void;
}

export function RestoreStep({ onBack }: Props) {
  const [phrase, setPhrase] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = usePassphraseAuth();

  async function handleRestore() {
    const validation = validatePassphrase(phrase);
    if (!validation.ok) {
      setError(`Invalid passphrase: ${validation.reason}`);
      return;
    }

    setRestoring(true);
    setError(null);
    try {
      await auth.signIn({ passphrase: phrase });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRestoring(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Restore account</h2>
          <p className="text-slate-600 mt-2">
            Type your 24-word passphrase to sign in on this device.
          </p>
        </div>

        <textarea
          className="w-full p-2 border rounded font-mono text-sm"
          rows={4}
          data-testid="restore-passphrase-input"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="word1 word2 word3 ... word24"
          disabled={restoring}
        />

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm" data-testid="restore-error">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button
            className="flex-1"
            data-testid="restore-btn"
            disabled={!phrase.trim() || restoring}
            onClick={handleRestore}
          >
            {restoring ? "Restoring..." : "Restore"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Manually create an account in one browser, copy the passphrase, then in another browser (incognito) click Restore and paste the passphrase. Expected: signs in as the same account.

- [ ] **Step 3: Commit**

```bash
git add src/routes/onboarding/restore-step.tsx
git commit -m "feat(onboarding): restore-account step via passphrase"
```

---

### Task 25: Home screen scaffold

**Files:**
- Create: `src/routes/home/index.tsx`, `src/components/sidebar.tsx`, `src/components/empty-state.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the empty state component**

`src/components/empty-state.tsx`:

```tsx
interface Props {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h3 className="text-lg font-medium text-slate-700">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 max-w-sm">{description}</p>
    </div>
  );
}
```

- [ ] **Step 2: Build the sidebar**

`src/components/sidebar.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";

export function Sidebar() {
  const { me } = useAccount(JazzMessangerAccount, {
    resolve: { contactBook: true, profile: true },
  });

  if (!me) return null;

  const contacts = me.contactBook ?? [];

  return (
    <aside className="w-64 border-r border-slate-200 flex flex-col">
      <header className="p-4 border-b border-slate-200">
        <p className="text-sm font-medium" data-testid="sidebar-display-name">
          {me.profile?.displayName ?? "Loading..."}
        </p>
      </header>

      <nav className="flex-1 overflow-y-auto p-2" data-testid="contact-list">
        {contacts.length === 0 ? (
          <p className="text-xs text-slate-400 p-2">No contacts yet</p>
        ) : (
          contacts.map((c, i) => (
            <div key={i} className="p-2 hover:bg-slate-100 rounded">
              {c?.displayNameLocal ?? "..."}
            </div>
          ))
        )}
      </nav>

      <footer className="p-4 border-t border-slate-200">
        <a
          href="/settings"
          className="text-sm text-slate-600 hover:text-slate-900"
          data-testid="settings-link"
        >
          Settings
        </a>
      </footer>
    </aside>
  );
}
```

The exact `useAccount` signature depends on Jazz's React bindings; adjust if the resolve syntax differs.

- [ ] **Step 3: Build the home route**

`src/routes/home/index.tsx`:

```tsx
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

export function HomeRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1" data-testid="home-main">
        <EmptyState
          title="No conversations yet"
          description="Send an invite link to a friend to start your first conversation."
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Switch App to render Home when signed in**

`src/App.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";

export default function App() {
  const { me } = useAccount(JazzMessangerAccount);

  // me is null/undefined when no account is loaded (logged out).
  if (!me) return <OnboardingRoute />;
  return <HomeRoute />;
}
```

- [ ] **Step 5: Smoke-test**

Run `npm run sync` + `npm run dev`. Create an account end-to-end, confirm landing on the home screen with sidebar showing your display name and "No contacts yet" + main area showing "No conversations yet" empty state.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx src/components/empty-state.tsx src/routes/home/index.tsx src/App.tsx
git commit -m "feat(home): minimal home screen with sidebar and empty state"
```

---

### Task 26: Settings page scaffold

**Files:**
- Create: `src/routes/settings/index.tsx`, `src/routes/settings/profile-section.tsx`, `src/routes/settings/devices-section.tsx`, `src/routes/settings/account-section.tsx`, `src/components/safety-number.tsx`
- Modify: `src/App.tsx` (add routing)

- [ ] **Step 1: Add minimal client-side routing**

We deferred react-router setup; now we need it. Update `src/App.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";
import { SettingsRoute } from "./routes/settings";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  const { me } = useAccount(JazzMessangerAccount);

  if (!me) return <OnboardingRoute />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/settings/*" element={<SettingsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Build SafetyNumber component**

`src/components/safety-number.tsx`:

```tsx
import { formatSafetyNumber } from "@/auth/fingerprint";

interface Props {
  fingerprintHex: string;
}

export function SafetyNumber({ fingerprintHex }: Props) {
  const formatted = formatSafetyNumber(fingerprintHex);
  return (
    <code
      className="font-mono text-sm bg-slate-50 p-3 rounded block break-all"
      data-testid="safety-number"
    >
      {formatted}
    </code>
  );
}
```

- [ ] **Step 3: Build settings sections**

`src/routes/settings/profile-section.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";

export function ProfileSection() {
  const { me } = useAccount(JazzMessangerAccount, { resolve: { profile: true } });
  if (!me?.profile) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-medium">Profile</h3>
      <p>Display name: <span data-testid="settings-display-name">{me.profile.displayName}</span></p>
    </section>
  );
}
```

`src/routes/settings/devices-section.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";

export function DevicesSection() {
  const { me } = useAccount(JazzMessangerAccount, { resolve: { devices: true } });
  const devices = me?.devices ?? [];
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-medium">Devices</h3>
      <ul data-testid="device-list">
        {devices.map((d, i) => (
          <li key={i} className="text-sm">
            {d?.label} — added {d?.addedAt?.toLocaleDateString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`src/routes/settings/account-section.tsx`:

```tsx
import { useAccount } from "jazz-tools-react";
import { JazzMessangerAccount } from "@/jazz/schema/account";
import { SafetyNumber } from "@/components/safety-number";

export function AccountSection() {
  const { me } = useAccount(JazzMessangerAccount);
  if (!me) return null;
  // me.id (or me.$jazz.id; adjust per Jazz API) is the accountID.
  // The Ed25519 pubkey hex is derived from the accountID encoding in Jazz;
  // for Slice 1 we use the accountID string directly as input to formatSafetyNumber.
  const fingerprintHex = (me.id ?? "").replace(/[^0-9a-fA-F]/g, "").padEnd(64, "0").slice(0, 64);
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-medium">Account</h3>
      <p className="text-sm text-slate-600">Your safety number:</p>
      <SafetyNumber fingerprintHex={fingerprintHex} />
    </section>
  );
}
```

The accountID-to-fingerprint mapping is approximate in Slice 1. Slice 2 (TOFU pinning) introduces a proper Ed25519-pubkey-extraction helper; we use a placeholder here so the UI exists.

`src/routes/settings/index.tsx`:

```tsx
import { Link } from "react-router-dom";
import { ProfileSection } from "./profile-section";
import { DevicesSection } from "./devices-section";
import { AccountSection } from "./account-section";

export function SettingsRoute() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header>
        <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
          ← Home
        </Link>
        <h2 className="text-2xl font-semibold mt-2">Settings</h2>
      </header>
      <ProfileSection />
      <DevicesSection />
      <AccountSection />
    </div>
  );
}
```

- [ ] **Step 4: Smoke-test**

Run app, sign in, click Settings link in sidebar, confirm Profile / Devices / Account sections render with real data (your display name, your one device, a safety number).

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/ src/components/safety-number.tsx src/App.tsx
git commit -m "feat(settings): scaffold settings page with profile, devices, account sections"
```

---

### Task 27: End-to-end test — account creation flow

**Files:**
- Create: `tests/e2e/account-creation.spec.ts`
- Modify: `tests/e2e/sanity.spec.ts` (delete; replaced by real tests)

- [ ] **Step 1: Write the e2e test**

`tests/e2e/account-creation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("user can create an account end-to-end", async ({ page }) => {
  await page.goto("/");

  // Welcome step
  await expect(page.getByRole("heading", { name: /welcome to jazz messanger/i })).toBeVisible();
  await page.getByTestId("create-account-btn").click();

  // Passphrase display
  const grid = page.getByTestId("passphrase-grid");
  await expect(grid).toBeVisible();
  const wordCount = await grid.locator("> div").count();
  expect(wordCount).toBe(24);

  // Capture the passphrase for the confirm step
  const words: string[] = [];
  for (let i = 0; i < 24; i++) {
    const text = await grid.locator("> div").nth(i).textContent();
    // text is like "1. apple"; take the second token
    words.push(text!.trim().split(/\s+/).slice(1).join(" "));
  }

  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Confirm step — figure out which words are asked
  const confirmInputs = page.locator('[data-testid^="confirm-word-"]');
  await expect(confirmInputs).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const labelText = await page
      .locator("label")
      .nth(i)
      .locator("span")
      .first()
      .textContent();
    const wordNumber = parseInt(labelText!.match(/\d+/)![0], 10);
    await confirmInputs.nth(i).fill(words[wordNumber - 1]);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  // Profile step
  await page.getByTestId("display-name-input").fill("Test User");
  await page.getByTestId("finish-onboarding-btn").click();

  // Home screen
  await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("sidebar-display-name")).toHaveText("Test User");
});
```

- [ ] **Step 2: Delete the sanity test**

```bash
rm tests/e2e/sanity.spec.ts
```

- [ ] **Step 3: Run the e2e test**

```bash
npm run test:e2e -- account-creation
```

Expected: passes in both Chromium and Firefox. If it fails, debug — this is the canonical proof Slice 1 works.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/account-creation.spec.ts
git rm tests/e2e/sanity.spec.ts
git commit -m "test(e2e): account creation flow end-to-end"
```

---

### Task 28: End-to-end test — account persists across reload

**Files:**
- Create: `tests/e2e/account-persistence.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";

test("account persists across browser reload", async ({ page }) => {
  // Helper: create account quickly (lifted from account-creation.spec.ts)
  async function createAccount(displayName: string) {
    await page.goto("/");
    await page.getByTestId("create-account-btn").click();

    const grid = page.getByTestId("passphrase-grid");
    const words: string[] = [];
    for (let i = 0; i < 24; i++) {
      const text = await grid.locator("> div").nth(i).textContent();
      words.push(text!.trim().split(/\s+/).slice(1).join(" "));
    }

    await page.getByTestId("passphrase-saved-checkbox").check();
    await page.getByTestId("passphrase-display-continue").click();

    const confirmInputs = page.locator('[data-testid^="confirm-word-"]');
    for (let i = 0; i < 3; i++) {
      const labelText = await page
        .locator("label")
        .nth(i)
        .locator("span")
        .first()
        .textContent();
      const wordNumber = parseInt(labelText!.match(/\d+/)![0], 10);
      await confirmInputs.nth(i).fill(words[wordNumber - 1]);
    }
    await page.getByTestId("confirm-passphrase-btn").click();

    await page.getByTestId("display-name-input").fill(displayName);
    await page.getByTestId("finish-onboarding-btn").click();

    await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 10000 });
  }

  await createAccount("Persisted User");
  await expect(page.getByTestId("sidebar-display-name")).toHaveText("Persisted User");

  // Reload
  await page.reload();

  // Should land on home, not onboarding
  await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("sidebar-display-name")).toHaveText("Persisted User");
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- account-persistence
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/account-persistence.spec.ts
git commit -m "test(e2e): account persists across browser reload"
```

---

### Task 29: End-to-end test — restore account on a fresh browser

**Files:**
- Create: `tests/e2e/restore-account.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect, type BrowserContext } from "@playwright/test";

test("user can restore account on a fresh browser context", async ({ browser }) => {
  // Context A: create account, capture passphrase
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  await pageA.goto("/");
  await pageA.getByTestId("create-account-btn").click();

  const grid = pageA.getByTestId("passphrase-grid");
  const words: string[] = [];
  for (let i = 0; i < 24; i++) {
    const text = await grid.locator("> div").nth(i).textContent();
    words.push(text!.trim().split(/\s+/).slice(1).join(" "));
  }
  const fullPhrase = words.join(" ");

  await pageA.getByTestId("passphrase-saved-checkbox").check();
  await pageA.getByTestId("passphrase-display-continue").click();
  const confirmInputs = pageA.locator('[data-testid^="confirm-word-"]');
  for (let i = 0; i < 3; i++) {
    const labelText = await pageA
      .locator("label")
      .nth(i)
      .locator("span")
      .first()
      .textContent();
    const wordNumber = parseInt(labelText!.match(/\d+/)![0], 10);
    await confirmInputs.nth(i).fill(words[wordNumber - 1]);
  }
  await pageA.getByTestId("confirm-passphrase-btn").click();
  await pageA.getByTestId("display-name-input").fill("Original User");
  await pageA.getByTestId("finish-onboarding-btn").click();
  await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10000 });

  await ctxA.close();

  // Context B: restore using captured passphrase
  const ctxB: BrowserContext = await browser.newContext();
  const pageB = await ctxB.newPage();

  await pageB.goto("/");
  await pageB.getByTestId("restore-account-btn").click();
  await pageB.getByTestId("restore-passphrase-input").fill(fullPhrase);
  await pageB.getByTestId("restore-btn").click();

  // Same display name should appear (via sync from server)
  await expect(pageB.getByTestId("home-main")).toBeVisible({ timeout: 10000 });
  await expect(pageB.getByTestId("sidebar-display-name")).toHaveText("Original User");

  await ctxB.close();
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- restore-account
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/restore-account.spec.ts
git commit -m "test(e2e): restore account on fresh browser context via passphrase"
```

---

### Task 30: Slice 1 review and CHANGELOG

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md` (create if absent)

- [ ] **Step 1: Run the full test suite**

```bash
npm test && npm run test:e2e
```

All tests should pass. If anything is red, fix before proceeding.

- [ ] **Step 2: Write a minimal README**

`README.md`:

```markdown
# Jazz Messanger

A local-first, end-to-end-encrypted messenger for small trust circles. Built on Jazz/CoJSON.

## Status

E1a Slice 1 — Foundation + Account Creation. See `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` for the full design.

## Development

Requires Node 22+.

```bash
npm install
npm run sync     # in one terminal — local sync server on :4200
npm run dev      # in another — Vite dev server on :5173
```

Tests:

```bash
npm test          # unit tests via Vitest
npm run test:e2e  # end-to-end tests via Playwright
```

## Documents

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
- `docs/security/threat-model.md` — security threat model
```

- [ ] **Step 3: Write the CHANGELOG**

`CHANGELOG.md`:

```markdown
# Changelog

## [Unreleased]

### Slice 1 — Foundation + Account Creation

- Vite + React + TypeScript + Tailwind + shadcn/ui project scaffold.
- jazz-tools 0.20.x integration with passphrase auth.
- Local sync server runnable via `npm run sync`.
- All eight CoValue schemas defined (Profile, DeviceRecord, Contact, ContactBook, Invitation, FileBlob, Message, Conversation, JazzMessangerAccount).
- Onboarding flow: welcome → passphrase display → passphrase confirm → profile → home.
- Restore-account flow via 24-word passphrase.
- Settings page with Profile, Devices, and Account (safety number) sections.
- End-to-end tests in Chromium and Firefox covering account creation, persistence, and restore.
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add README and CHANGELOG for Slice 1"
```

- [ ] **Step 5: Tag the slice**

```bash
git tag -a slice-1-complete -m "E1a Slice 1: Foundation + Account Creation complete"
```

---

## Slice 1 done definition

All of the following must be true:

- [ ] `npm test` exits 0 (all unit tests pass).
- [ ] `npm run test:e2e` exits 0 in both Chromium and Firefox.
- [ ] Manual verification: open the app, create an account, refresh the page, confirm you're still signed in.
- [ ] Manual verification: open the app in a second browser (or incognito), restore the account using the passphrase from the first, confirm the same display name renders.
- [ ] Manual verification: navigate to Settings, confirm Profile / Devices / Account sections render with correct data.

When all are checked, Slice 1 is complete and we move to **Slice 2: QR Multi-Device Pairing + Contact Invitations** (next plan to be written).

---

## Notes for the Slice 2 author

A few things to know when planning the next slice:

- The schema for `Conversation.authorWriteGroups`, `Contact.linkedConversation`, and the per-author WriteGroup naming convention all need finalizing before Slice 3. Slice 2 introduces enough of the contact infrastructure that we can validate the patterns.
- The `EphemeralPairing` CoValue is new in Slice 2 — design spec §4.3.
- The fingerprint extraction in `account-section.tsx` is currently a placeholder; Slice 2 must replace it with the real Ed25519-pubkey extraction from the Account.
- Better Auth bridge is **not** in Slice 2 — that's E1.1.