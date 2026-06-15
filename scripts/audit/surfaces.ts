// scripts/audit/surfaces.ts

/**
 * A capturable surface variant. One entry → two PNGs (desktop + mobile).
 *
 * `id` is the stable filename slug. Use kebab-case; modal variants suffix
 * `--modal-<name>` so the diff against design references is unambiguous.
 *
 * `route` is the path to navigate to. `:meId` / `:bobId` / `:convId` /
 * `:bobContactId` placeholders are replaced from the fixture seeder's
 * Substitutions result at capture time.
 *
 * `state` is the named precondition the fixture seeder must reach before
 * capture. "anonymous" means: clear all cookies, no sign-in.
 *
 * `modalTrigger` (optional) is a Playwright selector that gets clicked
 * after the route loads. The screenshot fires once `waitFor` resolves.
 *
 * `waitFor` (optional) is a selector that must be visible before the
 * screenshot fires. Defaults to body visibility.
 *
 * Surfaces that aren't deterministically capturable in a single browser
 * context (incoming-connection-request prompt; live-pair partner; full
 * /invite landing with fragment) are intentionally omitted — see the
 * SKIPPED block at the bottom of this file.
 */
export interface Surface {
  id: string;
  route: string;
  state:
    | "anonymous"
    | "alice-empty"
    | "alice-with-bob-1to1"
    | "alice-with-group"
    | "alice-with-live-invite";
  modalTrigger?: string;
  waitFor?: string;
}

export const SURFACES: Surface[] = [
  // ─── Auth + onboarding (anonymous) ───────────────────────────────────
  { id: "auth-login", route: "/auth/login", state: "anonymous", waitFor: '[data-testid="login-submit"]' },
  { id: "auth-recovery", route: "/auth/recovery", state: "anonymous", waitFor: '[data-testid="recovery-code-input"]' },
  { id: "onboarding", route: "/onboarding", state: "anonymous", waitFor: '[data-testid="create-account-btn"]' },

  // ─── Conversations list ──────────────────────────────────────────────
  // home-main is `hidden md:flex`, so for mobile we wait on sidebar.
  { id: "conv-list-empty", route: "/", state: "alice-empty", waitFor: '[data-testid="sidebar-display-name"]' },
  { id: "conv-list-1to1", route: "/", state: "alice-with-bob-1to1", waitFor: '[data-testid="conversation-list"]' },
  { id: "conv-list-group", route: "/", state: "alice-with-group", waitFor: '[data-testid="conversation-list"]' },

  // ─── Conversation detail ─────────────────────────────────────────────
  {
    id: "conv-detail-1to1",
    route: "/conversations/:convId",
    state: "alice-with-bob-1to1",
    waitFor: '[data-testid="conversation-detail"]',
  },
  {
    id: "conv-detail-group",
    route: "/conversations/:convId",
    state: "alice-with-group",
    waitFor: '[data-testid="conversation-detail"]',
  },
  {
    id: "conv-members-group",
    route: "/conversations/:convId/members",
    state: "alice-with-group",
    waitFor: '[data-testid="members-route"]',
  },
  {
    id: "conv-new",
    route: "/conversations/new",
    state: "alice-with-bob-1to1",
    waitFor: '[data-testid="new-convo-back"]',
  },

  // ─── Contacts ────────────────────────────────────────────────────────
  {
    id: "contacts-empty",
    route: "/contacts",
    state: "alice-empty",
    waitFor: '[data-testid="contacts-empty"]',
  },
  {
    id: "contacts-list",
    route: "/contacts",
    state: "alice-with-bob-1to1",
    waitFor: '[data-testid="contacts-page-list"]',
  },
  {
    id: "contacts-add",
    route: "/contacts/add",
    state: "alice-empty",
    waitFor: '[data-testid="add-contact-waiting"]',
  },
  {
    id: "contact-detail",
    route: "/contacts/:bobContactId",
    state: "alice-with-bob-1to1",
    waitFor: '[data-testid="contact-detail-name"]',
  },

  // ─── Profile (polymorphic) ───────────────────────────────────────────
  {
    id: "profile-own",
    route: "/profile/:meId",
    state: "alice-with-bob-1to1",
    waitFor: "h1",
  },
  {
    id: "profile-other",
    route: "/profile/:bobId",
    state: "alice-with-bob-1to1",
    waitFor: "h1",
  },

  // ─── Connections ─────────────────────────────────────────────────────
  // The "with content" variants (pending requests, live invites with rows)
  // require a second context generating a request / a fresh invitation.
  // alice-with-live-invite is the easiest — visiting /contacts/add creates
  // a live invitation as a side-effect.
  {
    id: "connections-pending-empty",
    route: "/connections/pending",
    state: "alice-empty",
    waitFor: "h1",
  },
  {
    id: "connections-live-invites-empty",
    route: "/connections/live-invites",
    state: "alice-empty",
    waitFor: "h1",
  },
  {
    id: "connections-live-invites",
    route: "/connections/live-invites",
    state: "alice-with-live-invite",
    waitFor: "h1",
  },

  // ─── Settings ────────────────────────────────────────────────────────
  // Settings is a single-page scroll today (no sub-routes under /settings/*).
  // The audit doc treats the section as one surface; per-section rows can
  // still be authored against the single capture.
  { id: "settings-root", route: "/settings", state: "alice-empty", waitFor: "h1" },

  // ─── Pair (auth-optional) ────────────────────────────────────────────
  // /pair?role=initiator is the destination of "Link new device" — full
  // screen, not a modal. This replaces the plan's modal-pair-qr surface.
  {
    id: "pair-initiator",
    route: "/pair?role=initiator",
    state: "alice-empty",
    waitFor: '[data-testid="pair-waiting"], [data-testid="pair-init-error"], [data-testid="pair-approval-prompt"]',
  },
  {
    id: "pair-responder",
    route: "/pair",
    state: "anonymous",
    waitFor: "h1",
  },

  // ─── Modal surfaces (route + modalTrigger) ───────────────────────────
  {
    id: "modal-change-password",
    route: "/settings",
    state: "alice-empty",
    modalTrigger: '[data-testid="change-password-btn"]',
    waitFor: '[data-testid="change-password-modal"]',
  },
  {
    id: "modal-view-recovery-code",
    route: "/settings",
    state: "alice-empty",
    modalTrigger: '[data-testid="view-recovery-code-btn"]',
    waitFor: '[data-testid="view-recovery-code-modal"]',
  },
];

// Intentionally skipped surfaces (documented for the audit reviewer):
//
//   - connections-pending (with content) — needs a second browser context
//     issuing a ConnectionRequest to Alice. Hand-capture during Phase B
//     or pull from existing e2e fixture data.
//   - invite-landing — the /invite route stashes the fragment to session-
//     storage and redirects. Capturing the actual accept-screen needs a
//     valid invite URL fragment from a live Invitation; deferred.
//   - trusted-device prompt — appears only when an unrecognized device
//     pairs; not reachable from a single-context seeder.
//   - incoming-connection-request modal — appears only when channel=qr
//     ConnectionRequest arrives mid-session; needs a partner context.
