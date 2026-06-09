# Unit 3 follow-up — Feedback form + Linear label reshape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Linear `Nox` team labels (rename `Improvement` → `Idea`, drop `Feature`, add `Question` + `Note`), update the `api/` defaults to point at the new label UUIDs, and revise the in-app feedback form (drop the email input; switch to multi-file attachment UX with neutral copy; render lowercase category chips).

**Architecture:** The feedback backend route (`POST /api/feedback`) already exists from the Units 3+5 ship. This follow-up only changes the **set of allowed categories** (server map + UI chips) and the **form layout** (no email input; multi-file attachment list). The backend's session-gated auth + verified email extraction + multi-file 10 MB cap are unchanged.

**Tech Stack:** TypeScript strict, React 18, Tailwind v3 + tokens (Unit 7), Hono, Linear GraphQL via `@linear/sdk` or direct fetch (existing `LinearClient` in `api/src/linear-client.ts`).

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Unit 3 follow-up.

## Known Linear IDs (existing as of 2026-06-08)

| Purpose | UUID |
|---|---|
| Team `Nox` | `8f04cf65-d7a9-41d3-bc9b-5074f744e850` |
| Project `Arcan` | `79d46a12-7563-4e3c-833b-d49531d94bb1` |
| Label `Feedback` (umbrella) | `e4c59d7f-2ebb-4ea0-bc37-f4e863b5a694` |
| Label `Bug` | `c8272cda-3f22-4850-b267-d166b844f770` |
| Label `Improvement` (will rename to `Idea`) | `9c75086b-59b9-4f61-b0d4-525932b42231` |
| Label `Feature` (will be dropped) | `7a184ee1-2c4d-4451-a09a-d16413d196ef` |
| Label `Question` | TBD — created in Phase 1 |
| Label `Note` | TBD — created in Phase 1 |

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree

- [ ] **Step 1: Confirm clean main + create branch**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git checkout main && git pull
git checkout -b unit-3-followup-feedback-revision
```

---

## Phase 1 · Linear workspace label reshape

This phase touches the Linear workspace itself, not the codebase. The agent has access to Linear via the `mcp__claude_ai_Linear__*` tools. If executed by a subagent that doesn't have those tools, the agent **reports back with the exact mutations needed** and the human runs them; otherwise the agent does them directly.

### Task 1.1: Rename `Improvement` → `Idea`

- [ ] **Step 1: Look up the current label**

If using MCP: `mcp__claude_ai_Linear__list_issue_labels({ team: "Nox", name: "Improvement" })` and confirm the UUID matches `9c75086b-59b9-4f61-b0d4-525932b42231`.

- [ ] **Step 2: Rename it**

Linear's MCP doesn't have a direct `update_issue_label` mutation surfaced consistently. Two paths:

- If `mcp__claude_ai_Linear__save_issue_label` or similar exists, use it: `{ id: "9c75086b-…", name: "Idea" }`.
- Otherwise: surface to user with the exact change ("Rename the `Improvement` label in Linear → `Idea`. ID `9c75086b-59b9-4f61-b0d4-525932b42231`. Confirm when done.") and wait.

After rename, capture the (unchanged) UUID for the env var: `LINEAR_LABEL_IDEA_ID = 9c75086b-59b9-4f61-b0d4-525932b42231`.

### Task 1.2: Drop `Feature`

- [ ] **Step 1: List issues currently labelled `Feature`**

```
mcp__claude_ai_Linear__list_issues({ team: "Nox", filter: { labels: { name: { eq: "Feature" } } } })
```

If any exist: report them, ask the user how to relabel (probably move to `Idea`).

- [ ] **Step 2: Archive the label (Linear doesn't truly delete labels; archive is the conventional path)**

Surface to user OR use the MCP delete if available. Capture the result.

### Task 1.3: Create `Question` label

- [ ] **Step 1: Create**

```
mcp__claude_ai_Linear__create_issue_label({
  name: "Question",
  teamId: "8f04cf65-d7a9-41d3-bc9b-5074f744e850",
  color: "#7dcfff",
  description: "User-submitted feedback: a question (in-app feedback form). Paired with the Feedback umbrella label.",
})
```

Capture the returned UUID → `LINEAR_LABEL_QUESTION_ID`.

### Task 1.4: Create `Note` label

- [ ] **Step 1: Create**

```
mcp__claude_ai_Linear__create_issue_label({
  name: "Note",
  teamId: "8f04cf65-d7a9-41d3-bc9b-5074f744e850",
  color: "#8a93b2",
  description: "User-submitted feedback: a note (catch-all for general feedback that isn't bug, idea, or question). Paired with the Feedback umbrella label.",
})
```

Capture the returned UUID → `LINEAR_LABEL_NOTE_ID`.

### Task 1.5: Record the new IDs

- [ ] **Step 1: Write a brief audit note**

Append to this plan or commit message: the four current category label UUIDs:

```
LINEAR_LABEL_BUG_ID      = c8272cda-3f22-4850-b267-d166b844f770
LINEAR_LABEL_IDEA_ID     = 9c75086b-59b9-4f61-b0d4-525932b42231   (renamed from Improvement)
LINEAR_LABEL_QUESTION_ID = <newly-created UUID>
LINEAR_LABEL_NOTE_ID     = <newly-created UUID>
```

No code commit yet — Phase 2 updates the env defaults.

---

## Phase 2 · Update `api/src/env.ts` defaults

### Task 2.1: Replace the label UUID defaults

**Files:**
- Modify: `api/src/env.ts`

- [ ] **Step 1: Read current env.ts**

```bash
cat api/src/env.ts
```

You'll see existing `LINEAR_LABEL_BUG_ID`, `LINEAR_LABEL_IMPROVEMENT_ID`, `LINEAR_LABEL_FEATURE_ID` defaults.

- [ ] **Step 2: Edit — remove old, add new**

Remove these lines:

```typescript
  LINEAR_LABEL_IMPROVEMENT_ID: optional("LINEAR_LABEL_IMPROVEMENT_ID", "9c75086b-59b9-4f61-b0d4-525932b42231"),
  LINEAR_LABEL_FEATURE_ID: optional("LINEAR_LABEL_FEATURE_ID", "7a184ee1-2c4d-4451-a09a-d16413d196ef"),
```

Add these (use the actual UUIDs from Phase 1.3 + 1.4):

```typescript
  LINEAR_LABEL_IDEA_ID: optional("LINEAR_LABEL_IDEA_ID", "9c75086b-59b9-4f61-b0d4-525932b42231"),
  LINEAR_LABEL_QUESTION_ID: optional("LINEAR_LABEL_QUESTION_ID", "<paste-the-question-uuid>"),
  LINEAR_LABEL_NOTE_ID: optional("LINEAR_LABEL_NOTE_ID", "<paste-the-note-uuid>"),
```

Keep `LINEAR_LABEL_BUG_ID` unchanged. Keep `LINEAR_LABEL_FEEDBACK_ID` unchanged.

---

## Phase 3 · Update `api/src/feedback-route.ts` categoryLabels

### Task 3.1: Swap the category map

**Files:**
- Modify: `api/src/feedback-route.ts`
- Modify: `api/src/index.ts` (where the route is registered)

- [ ] **Step 1: Update the `FeedbackRouteConfig.categoryLabels` type**

In `api/src/feedback-route.ts`, find the `categoryLabels` field on `FeedbackRouteConfig`:

```typescript
categoryLabels: Record<"Bug" | "Improvement" | "Feature", string>;
```

Replace with:

```typescript
categoryLabels: Record<"Bug" | "Idea" | "Question" | "Note", string>;
```

Update the route handler's category lookup:

```typescript
const categoryRaw = form["category"];
const category =
  typeof categoryRaw === "string" && categoryRaw in config.categoryLabels
    ? (categoryRaw as keyof typeof config.categoryLabels)
    : undefined;
```

This already gates the value via `in config.categoryLabels`, so the runtime check still works.

- [ ] **Step 2: Update the route registration in `api/src/index.ts`**

Find the `registerFeedbackRoute(app, { ... categoryLabels: { Bug, Improvement, Feature } ... })` call. Replace:

```typescript
categoryLabels: {
  Bug: env.LINEAR_LABEL_BUG_ID,
  Improvement: env.LINEAR_LABEL_IMPROVEMENT_ID,
  Feature: env.LINEAR_LABEL_FEATURE_ID,
},
```

with:

```typescript
categoryLabels: {
  Bug: env.LINEAR_LABEL_BUG_ID,
  Idea: env.LINEAR_LABEL_IDEA_ID,
  Question: env.LINEAR_LABEL_QUESTION_ID,
  Note: env.LINEAR_LABEL_NOTE_ID,
},
```

---

## Phase 4 · Update `api/tests/feedback.test.ts`

### Task 4.1: Update test fixtures + assertions

**Files:**
- Modify: `api/tests/feedback.test.ts`

- [ ] **Step 1: Read the current test file**

```bash
cat api/tests/feedback.test.ts | head -80
```

Note where the test config is built and where `body.set("category", "Bug")` etc. assertions live.

- [ ] **Step 2: Update the config used in `makeAuthAndApp`**

Find:

```typescript
registerFeedbackRoute(app, {
  ...
  categoryLabels: {
    Bug: "bug-label-uuid",
    Improvement: "improvement-label-uuid",
    Feature: "feature-label-uuid",
  },
  ...
});
```

Replace with:

```typescript
categoryLabels: {
  Bug: "bug-label-uuid",
  Idea: "idea-label-uuid",
  Question: "question-label-uuid",
  Note: "note-label-uuid",
},
```

- [ ] **Step 3: Update the happy-path test that sets `category: "Bug"`**

The first happy-path test already uses `body.set("category", "Bug")` — that still works. Add a parallel test for one of the new categories, e.g.:

Append a new test after the existing happy-path:

```typescript
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
```

- [ ] **Step 4: Run the api test suite**

```bash
cd api && npx vitest run && cd ..
```

Expected: all tests pass, including the new Idea test.

---

## Phase 5 · Commit the backend changes

### Task 5.1: Commit Phases 1–4

- [ ] **Step 1: Commit**

```bash
git add api/src/env.ts api/src/feedback-route.ts api/src/index.ts api/tests/feedback.test.ts
git commit -m "feat(api): reshape feedback categories to Bug/Idea/Question/Note

Linear labels reshaped: Improvement renamed to Idea (UUID preserved),
Feature dropped, Question + Note created. categoryLabels map and env
defaults updated accordingly. Tests cover the new label mapping.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Feedback form UI revision

### Task 6.1: Locate the existing feedback form

Currently the feedback form is rendered… nowhere in the shipped app. The backend exists; the UI was deferred to UI ref availability. With Unit 7 now shipped, this phase **creates** the in-app feedback form in Settings.

- [ ] **Step 1: Check for any existing form scaffold**

```bash
grep -rn "feedback" src/routes/settings --include="*.tsx" 2>/dev/null
```

If a partial feedback section exists, build on it. Otherwise create a new one.

### Task 6.2: Create `src/routes/settings/feedback-section.tsx`

**Files:**
- Create: `src/routes/settings/feedback-section.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { useToast } from "@/components/toast";

const CATEGORIES = ["bug", "idea", "question", "note"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  note: "Note",
};

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export function FeedbackSection() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const overCap = totalBytes > MAX_TOTAL_BYTES;
  const canSubmit = message.trim().length > 0 && !overCap && !submitting;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("message", message.trim());
      if (category) body.set("category", CATEGORY_LABEL[category]);
      for (const f of files) body.append("attachment", f);
      const res = await fetch("/api/feedback", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ icon: "check", text: "thanks — feedback sent", tone: "success" });
      setMessage("");
      setCategory(null);
      setFiles([]);
    } catch (err) {
      console.error("[feedback] submit failed:", err);
      toast({ icon: "alert", text: "couldn't send — try again", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 max-w-xl">
      <h2 className="text-base font-semibold text-text">Give feedback</h2>
      <p className="text-sm text-text-2">
        Found a bug or have an idea? tell us — it goes straight to the maker. We'll know it's from your account.
      </p>

      {/* Message */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">Your feedback</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="what's on your mind?"
          className="min-h-28 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm p-3 resize-y outline-none focus:border-arcan-accent"
          data-testid="feedback-message"
        />
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">Category · optional</span>
        <div className="flex gap-2 flex-wrap" data-testid="feedback-category">
          {CATEGORIES.map((k) => {
            const on = category === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(on ? null : k)}
                data-testid={`feedback-category-${k}`}
                className={`px-3 py-1.5 rounded-pill text-xs font-semibold border transition-colors ${
                  on
                    ? "bg-accent-soft text-arcan-accent border-accent-border"
                    : "bg-transparent text-text-2 border-hairline hover:bg-panel-2"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      {/* Attachments */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
          Attachments · optional
        </span>
        {files.length === 0 ? (
          <label className="flex items-center justify-center gap-2 p-3 rounded-r-3 border border-dashed border-hairline cursor-pointer text-text-2 text-sm hover:bg-panel-2">
            <input type="file" multiple onChange={onFileChange} className="hidden" data-testid="feedback-file-input" />
            <span>attach files (any type, ≤10 MB total)</span>
          </label>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-r-3 border border-hairline bg-panel">
                <span className="flex-1 text-sm text-text truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="text-xs text-dim flex-shrink-0">{Math.ceil(f.size / 1024)} KB</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-xs text-text-2 hover:text-red px-2 py-1"
                  data-testid={`feedback-file-remove-${i}`}
                >
                  remove
                </button>
              </div>
            ))}
            <label className="text-xs text-arcan-accent cursor-pointer self-start">
              <input type="file" multiple onChange={onFileChange} className="hidden" />
              + add more
            </label>
            <div className="text-xs text-dim">
              Total: {Math.ceil(totalBytes / 1024)} KB / {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
              {overCap && <span className="text-red ml-2">over cap</span>}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        data-testid="feedback-submit"
        className="self-start px-4 h-10 rounded-r-3 bg-arcan-accent text-on-accent font-semibold disabled:opacity-50"
      >
        {submitting ? "sending…" : "submit feedback"}
      </button>
    </section>
  );
}
```

### Task 6.3: Wire into `src/routes/settings/index.tsx`

**Files:**
- Modify: `src/routes/settings/index.tsx`

- [ ] **Step 1: Import + render**

Add:

```tsx
import { FeedbackSection } from "./feedback-section";
```

In the JSX, insert `<FeedbackSection />` between Appearance and Notifications (matches the hi-fi layout where feedback sits between appearance and notifications).

### Task 6.4: Test the form interaction

**Files:**
- Create: `tests/unit/routes/settings/feedback-section.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { FeedbackSection } from "@/routes/settings/feedback-section";
import type { ReactNode } from "react";

function Wrap({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("submits text-only feedback with no category", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, issue: { identifier: "NOX-99", url: "x" } }), { status: 200 })
    );
    const { getByTestId } = render(
      <Wrap>
        <FeedbackSection />
      </Wrap>
    );
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "hello" } });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    const formData = init?.body as FormData;
    expect(formData.get("message")).toBe("hello");
    expect(formData.get("category")).toBeNull();
  });

  test("clicking a category chip sends the Title-case label", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, issue: { identifier: "NOX-99", url: "x" } }), { status: 200 })
    );
    const { getByTestId } = render(
      <Wrap>
        <FeedbackSection />
      </Wrap>
    );
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "test bug" } });
    fireEvent.click(getByTestId("feedback-category-bug"));
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const formData = (fetchMock.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(formData.get("category")).toBe("Bug");
  });

  test("submit disabled until message is non-empty", () => {
    const { getByTestId } = render(
      <Wrap>
        <FeedbackSection />
      </Wrap>
    );
    const btn = getByTestId("feedback-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "x" } });
    expect(btn.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/unit/routes/settings/feedback-section.test.tsx
```

Expected: PASS (3 tests).

### Task 6.5: Commit Phase 6

```bash
git add src/routes/settings/feedback-section.tsx src/routes/settings/index.tsx tests/unit/routes/settings/feedback-section.test.tsx
git commit -m "feat(settings): in-app feedback form

Settings -> Feedback section: textarea for message, 4 lowercase
category chips (bug/idea/question/note) mapping to Bug/Idea/Question/Note
labels server-side, multi-file attachment UX with per-file remove and
total-size readout, ≤10 MB total cap enforced client-side (server has
the authoritative cap). Submit posts to /api/feedback with credentials
so the session-gated route extracts the verified email. Toast on
success/error. No email field — the account email is attached
server-side.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · Final verification + merge

### Task 7.1: Full build + test

- [ ] **Step 1: Run everything**

```bash
timeout 120 npm run test 2>&1 | tail -10
cd api && npx vitest run && cd ..
timeout 90 npm run build 2>&1 | tail -5
npm run check-tokens
```

Expected: all pass.

### Task 7.2: Smoke test

- [ ] **Step 1: Start the stack, navigate to Settings → Feedback, submit a test message**

```bash
LINEAR_API_TOKEN=<real-or-dummy> BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64) npm run dev:all &
```

Sign in, go to Settings → Feedback, type a message, pick a category, submit. With a real token, verify the issue lands in Linear with the right label set. Without a real token, expect the HTTP call to fail with a non-200 — that confirms the form/wire works.

Kill the dev stack.

### Task 7.3: Merge

```bash
git push -u origin unit-3-followup-feedback-revision
git checkout main
git merge --no-ff unit-3-followup-feedback-revision -m "Merge Unit 3 follow-up: feedback form + Linear label reshape

Linear labels: Improvement -> Idea (UUID preserved), Feature dropped,
Question + Note created. api/src/env.ts and feedback-route.ts updated.
In-app Settings -> Feedback section added with the 4 lowercase
category chips and multi-file attachment UX.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
git branch -d unit-3-followup-feedback-revision
git push origin --delete unit-3-followup-feedback-revision
```

---

## Self-review checklist

- [ ] Spec coverage: every Unit 3 follow-up bullet has a task (label reshape, env defaults, route map, drop email field, multi-file UX).
- [ ] No placeholders. All UUIDs are real (or have a documented capture point during execution).
- [ ] Type consistency: `categoryLabels: Record<"Bug" | "Idea" | "Question" | "Note", string>` used in route + tests + UI.
- [ ] The form submits to `/api/feedback` with `credentials: "include"` (session cookies must reach the route).
- [ ] No regressions to other tests — full suite passes.
