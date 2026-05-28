import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the sync-URL derivation in provider.tsx.
 *
 * The derivation is exported as a stand-alone helper so it can be tested
 * without rendering the JazzReactProvider (which would require a Jazz peer).
 */
import { deriveDefaultSyncURL } from "@/jazz/provider";

describe("deriveDefaultSyncURL", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ws://localhost:4200 when window is undefined (SSR-safe)", () => {
    vi.stubGlobal("window", undefined);
    expect(deriveDefaultSyncURL()).toBe("ws://localhost:4200");
  });

  it("returns wss://<host>/sync/ when the page is loaded over HTTPS", () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "chat.example.com" },
    });
    expect(deriveDefaultSyncURL()).toBe("wss://chat.example.com/sync/");
  });

  it("returns ws://<host>/sync/ when the page is loaded over HTTP", () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:8080" },
    });
    expect(deriveDefaultSyncURL()).toBe("ws://localhost:8080/sync/");
  });

  it("preserves a non-standard port in the host when present", () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "messenger.bar.org:8443" },
    });
    expect(deriveDefaultSyncURL()).toBe("wss://messenger.bar.org:8443/sync/");
  });
});
