/**
 * Tiny User-Agent introspection — produces a human label + OS family.
 * Output is a best-effort display string; not a security signal.
 */
export function deriveDeviceLabel(ua: string): string {
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}

export function deriveDeviceOS(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

/** "5 minutes ago" / "just now" — coarse, mono-style. */
export function relativeTime(d: Date | undefined): string {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 30) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
