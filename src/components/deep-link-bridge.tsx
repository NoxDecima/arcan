import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@/platform/is-tauri";
import { classifyIncomingUrl, initDeepLinks } from "@/platform/deep-link";
import {
  getServerOrigin,
  setServerOverride,
  probeServer,
} from "@/platform/server-config";
import { clearAuthToken } from "@/platform/auth-transport";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Shell-only: routes App Link arrivals into react-router; foreign-instance
 * links get a switch-server confirmation (spec §Deep links).
 *
 * Mount UNCONDITIONALLY in App (self-gates on isTauri) — unauthenticated
 * arrivals must work too. Must be inside BrowserRouter (needs useNavigate)
 * and ConfirmProvider (needs useConfirm) — both are satisfied by App.tsx's
 * provider stack.
 */
export function DeepLinkBridge() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Keep latest navigate/confirm in refs so the handler (closed over in the
  // init effect) always calls the current version without re-running init.
  const navigateRef = useRef(navigate);
  const confirmRef = useRef(confirm);

  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    confirmRef.current = confirm;
  });

  // Init effect runs ONCE per mount (empty deps). Re-navigation never
  // re-invokes initDeepLinks so the cold-start URL is not re-dispatched.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    // cancelled tracks whether the component unmounted before the async init
    // resolved, so we can properly clean up the late-resolved unlisten fn.
    let cancelled = false;

    void initDeepLinks((raw) => {
      const incoming = classifyIncomingUrl(raw, getServerOrigin());
      if (!incoming) return;

      if (incoming.kind === "navigate") {
        navigateRef.current(incoming.to);
        return;
      }

      // Foreign instance → ask before repointing the app.
      void (async () => {
        const host = new URL(incoming.origin).host;
        const ok = await confirmRef.current({
          title: "Switch server?",
          body: `You'll be signing in through ${host} — everything you send will go through that server. Only switch if you trust its operator. You'll be signed out here first.`,
          confirmLabel: "switch server",
          danger: true,
        });
        if (!ok) return;

        // Probe the foreign origin before committing. The CORS config on the
        // server gates whether the probe succeeds in a browser context; an
        // unreachable or non-Arcan server silently bails.
        if (!(await probeServer(incoming.origin))) {
          console.warn("[deep-link] foreign server probe failed — switch aborted", incoming.origin);
          return;
        }

        // setServerOverride validates + persists; it can throw if storage is
        // unavailable (QuotaExceededError, security policy). On failure we
        // warn and bail — no reload, no token clear — so the user stays on
        // the current server rather than ending up in a half-switched state.
        try {
          setServerOverride(incoming.origin);
        } catch (err) {
          console.warn("[deep-link] setServerOverride failed — switch aborted", err);
          return;
        }

        // Stash the pending invite AFTER persist succeeds (M1: the new
        // context needs it available when it loads the invite route).
        if (incoming.isInvite && incoming.hash) {
          try {
            sessionStorage.setItem("pending-invite-fragment", incoming.hash);
          } catch {
            /* degrade gracefully — invite replay skipped */
          }
        }

        clearAuthToken();
        window.location.assign(incoming.isInvite ? "/" : incoming.to);
      })();
    }).then((fn) => {
      // If the component unmounted before init resolved, invoke unlisten
      // immediately to avoid a subscription leak.
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return null;
}
