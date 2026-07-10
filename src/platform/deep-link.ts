import { isTauri } from "./is-tauri";

/**
 * Deep-link handling (spec §Deep links): one entry point for every URL
 * arrival — App Link taps (warm + cold start) and native QR scans all
 * resolve through classifyIncomingUrl.
 */
export type IncomingUrl =
  | { kind: "navigate"; to: string }
  | {
      kind: "foreign";
      origin: string;
      to: string;
      hash: string;
      isInvite: boolean;
    }
  | null;

export function classifyIncomingUrl(
  raw: string,
  currentOrigin: string,
): IncomingUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const to = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin === currentOrigin) {
    return { kind: "navigate", to };
  }
  return {
    kind: "foreign",
    origin: url.origin,
    to,
    hash: url.hash,
    isInvite: url.pathname.startsWith("/invite"),
  };
}

/**
 * Subscribe to deep links (shell only). Fires for the cold-start URL too.
 * Returns an unsubscribe function.
 */
export async function initDeepLinks(
  onUrl: (url: string) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  const initial = await getCurrent();
  if (initial) {
    for (const u of initial) onUrl(u);
  }
  const unlisten = await onOpenUrl((urls) => {
    for (const u of urls) onUrl(u);
  });
  return unlisten;
}
