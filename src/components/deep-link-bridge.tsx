import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@/platform/is-tauri";
import { classifyIncomingUrl, initDeepLinks } from "@/platform/deep-link";
import { getServerOrigin, setServerOverride } from "@/platform/server-config";
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

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    void initDeepLinks((raw) => {
      const incoming = classifyIncomingUrl(raw, getServerOrigin());
      if (!incoming) return;

      if (incoming.kind === "navigate") {
        navigate(incoming.to);
        return;
      }

      // Foreign instance → ask before repointing the app.
      void (async () => {
        const host = new URL(incoming.origin).host;
        const ok = await confirm({
          title: "Switch server?",
          body: `This link belongs to ${host}. Switching signs you out of the current server.`,
          confirmLabel: "switch server",
          danger: false,
        });
        if (!ok) return;

        if (incoming.isInvite && incoming.hash) {
          try {
            sessionStorage.setItem("pending-invite-fragment", incoming.hash);
          } catch {
            /* degrade gracefully — invite replay skipped */
          }
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

        clearAuthToken();
        window.location.assign(incoming.isInvite ? "/" : incoming.to);
      })();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, [navigate, confirm]);

  return null;
}
