import { test, expect, type WebSocketRoute } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

// Sync-status pill e2e — permanent spec.
//
// Verifies the SyncStatusPill behaviour in the conversation screen:
//   1. Pill appears (data-testid="sync-pill", "not syncing") when the Jazz
//      sync WebSocket is severed.
//   2. Tapping the pill opens the explanation popover.
//   3. Escape dismisses the popover.
//   4. Pill disappears once the connection is restored.
//
// Detection technique (established in commit d498919):
//   page.routeWebSocket intercepts the Vite-proxied Jazz sync socket
//   (ws://localhost:5173/sync/). The handler must be installed BEFORE Jazz
//   opens the WebSocket — routeWebSocket intercepts future connections only.
//   Pattern must be a regex (/.*sync.*/): Playwright glob strings don't
//   span "/" in path segments and silently fail to match WS URLs.
//   Strategy: (a) setup accounts + contact + conversation with a normal
//   "setup" page with full connectivity; (b) open a SECOND page in the same
//   context (shares IndexedDB/Jazz credentials), install a two-mode WS
//   handler (severed/pass-through controlled by a mutable flag) on that
//   page, navigate to the conversation URL. Jazz initialises fresh and its
//   first WS connect attempt is closed by the handler; after pill assertions
//   the flag is flipped to pass-through mode so the next retry reconnects.
//   useSyncConnectionStatus() flips to false on sever; back to true on
//   reconnect.
//
//   Restoration: Playwright 1.52 has no page.unrouteWebSocket — the handler
//   is kept in place but its mode is flipped (severed → pass-through) so
//   the next Jazz retry reaches the real sync server. This is functionally
//   equivalent to removing the handler.
//   context.setOffline does NOT sever established WebSockets — confirmed
//   during the original verification probe; routeWebSocket is the reliable
//   alternative.
//
// Firefox: Playwright's routeWebSocket is CDP-backed and is NOT supported
//   in Firefox as of Playwright 1.52. The test is scoped to chromium only
//   via test.skip; the Firefox project reports a clean skip.
//
// Timeout: 90 s to cover account creation + contact pairing +
//   conversation navigation + offline detection + reconnect window.

test(
  "sync pill appears when socket severs, popover works, pill clears on reconnect",
  async ({ browser, browserName }) => {
    // routeWebSocket is not supported in Firefox (Playwright 1.52).
    // Remove this skip once Firefox CDP WebSocket interception ships.
    test.skip(
      browserName === "firefox",
      "routeWebSocket not supported in Firefox (Playwright 1.52); chromium only",
    );

    test.setTimeout(90_000);

    // Two contexts needed: Bob for the contact pairing counterpart;
    // Alice for the actual pill test. Alice's context gets two pages:
    // one "setup" page with full connectivity for account creation and
    // contact flow, and one "test" page where the WS is severed.
    const ctxAlice = await browser.newContext();
    const ctxBob = await browser.newContext();
    const setup = await ctxAlice.newPage();
    const bob = await ctxBob.newPage();

    try {
      // ── Account creation ─────────────────────────────────────────────────
      await setup.goto("/");
      await createAccount(setup, "Alice");

      await bob.goto("/");
      await createAccount(bob, "Bob");

      // ── Establish contact & open conversation ────────────────────────────
      await establishContact(bob, setup, "Bob");
      await openDirectChat(setup, "Bob");

      await expect(setup.getByTestId("conversation-detail")).toBeVisible({
        timeout: 15_000,
      });

      // Capture conversation URL before switching pages.
      const conversationUrl = setup.url();

      // ── Open a fresh page with WS interception pre-installed ─────────────
      // A new page in the same context shares IndexedDB (Jazz account
      // credentials) but has no live WebSocket yet. We install the route
      // handler BEFORE navigating so it fires on Jazz's very first connect.
      //
      // The Vite dev proxy maps the browser's WS connection at
      // ws://localhost:5173/sync/ → ws://localhost:4200. We use a regex
      // (/.*sync.*/) because Playwright glob strings don't span "/" in
      // path segments and silently fail to match the sync URL.
      //
      // The handler is a two-mode gate controlled by the `severed` flag.
      // When true (initial): close incoming connections → pill appears.
      // When false (restored): forward to the real server → pill disappears.
      // Playwright 1.52 has no page.unrouteWebSocket; this is the equivalent.
      let severed = true;
      const alice = await ctxAlice.newPage();
      await alice.routeWebSocket(/.*sync.*/, (ws: WebSocketRoute) => {
        if (severed) {
          ws.close({ code: 1001 });
        } else {
          ws.connectToServer();
        }
      });

      // Navigate to the conversation. Jazz re-initialises and its first WS
      // attempt is intercepted and closed. useSyncConnectionStatus() detects
      // the disconnection when the connection attempt fails.
      await alice.goto(conversationUrl);
      await expect(alice.getByTestId("conversation-detail")).toBeVisible({
        timeout: 20_000,
      });

      // ── Assert: pill appears ─────────────────────────────────────────────
      // SyncStatusPill renders data-testid="sync-pill" (a <button>) when
      // useSyncConnectionStatus() === false. The outer wrapper (role=status)
      // has h-0 CSS (zero-height overlay) — assert on the pill button which
      // has real height via absolute positioning.
      await expect(alice.getByTestId("sync-pill")).toBeVisible({
        timeout: 15_000,
      });
      await expect(alice.getByTestId("sync-pill")).toContainText("not syncing");

      // Confirm the semantic structure: the outer wrapper carries role=status.
      await expect(alice.getByRole("status")).toBeAttached();

      // ── Assert: popover opens on tap ─────────────────────────────────────
      await alice.getByTestId("sync-pill").click();
      await expect(alice.getByTestId("sync-pill-popover")).toBeVisible({
        timeout: 5_000,
      });
      await expect(alice.getByTestId("sync-pill-popover")).toContainText(
        "offline",
      );

      // ── Assert: Escape dismisses the popover ─────────────────────────────
      await alice.keyboard.press("Escape");
      await expect(alice.getByTestId("sync-pill-popover")).toBeHidden({
        timeout: 3_000,
      });

      // ── Restore: flip handler to pass-through ─────────────────────────────
      // The next Jazz reconnect attempt (exponential backoff) will be
      // forwarded to the real sync server, restoring connectivity.
      severed = false;

      // ── Assert: pill disappears once syncing resumes ──────────────────────
      // Allow 20 s for Jazz to retry and useSyncConnectionStatus to flip back.
      await expect(alice.getByTestId("sync-pill")).toBeHidden({
        timeout: 20_000,
      });
    } finally {
      await ctxAlice.close();
      await ctxBob.close();
    }
  },
);
