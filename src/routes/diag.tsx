import { useEffect, useState } from "react";
import { deriveSyncUrl, getServerOrigin } from "@/platform/server-config";
import { isTauri, isTauriAndroid } from "@/platform/is-tauri";

type CheckState = "pending" | "pass" | "fail";
interface Check {
  label: string;
  state: CheckState;
  detail?: string;
}

/**
 * /diag — device diagnostics for shell builds (spec: Phase 0).
 * Verifies the load-bearing platform assumptions: secure context,
 * WebCrypto, WASM, IndexedDB persistence, and sync-server reachability.
 * Reachable by URL only (not linked from the UI).
 */
export function DiagRoute() {
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      const results: Check[] = [];

      // Push a completed check live so results appear incrementally rather
      // than all-at-once after the slowest check (WS 5 s timeout) resolves.
      // A wedged check therefore cannot blank the screen for earlier results.
      function report(check: Check) {
        results.push(check);
        if (alive) setChecks([...results]);
      }

      report({
        label: "environment",
        state: "pass",
        detail: `origin=${window.location.origin} tauri=${isTauri()} android=${isTauriAndroid()}`,
      });

      report({
        label: "secure context",
        state: window.isSecureContext ? "pass" : "fail",
      });

      report({
        label: "WebCrypto (crypto.subtle)",
        state: typeof crypto?.subtle?.digest === "function" ? "pass" : "fail",
      });

      try {
        // Argon2id via hash-wasm is the real dependency — exercise WASM.
        const { argon2id } = await import("hash-wasm");
        const hash = await argon2id({
          password: "diag",
          salt: new Uint8Array(16),
          parallelism: 1,
          iterations: 1,
          memorySize: 1024,
          hashLength: 16,
          outputType: "hex",
        });
        report({ label: "WASM (hash-wasm argon2id)", state: hash.length === 32 ? "pass" : "fail" });
      } catch (e) {
        report({ label: "WASM (hash-wasm argon2id)", state: "fail", detail: String(e) });
      }

      try {
        // 5 s timeout so a wedged IDB reports FAIL instead of hanging forever.
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("arcan-diag", 1);
            req.onupgradeneeded = () => req.result.createObjectStore("kv");
            req.onsuccess = () => {
              try {
                const db = req.result;
                const tx = db.transaction("kv", "readwrite");
                tx.objectStore("kv").put(Date.now(), "probe");
                tx.oncomplete = () => {
                  db.close();
                  // Fire-and-forget: clean up the probe DB so it doesn't linger.
                  indexedDB.deleteDatabase("arcan-diag");
                  resolve();
                };
                tx.onerror = () => reject(tx.error);
              } catch (e) {
                reject(e);
              }
            };
            req.onerror = () => reject(req.error);
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("IndexedDB open timed out after 5 s")), 5000)
          ),
        ]);
        report({ label: "IndexedDB write", state: "pass" });
      } catch (e) {
        report({ label: "IndexedDB write", state: "fail", detail: String(e) });
      }

      const syncUrl = deriveSyncUrl();
      const wsResult = await new Promise<Check>((resolve) => {
        try {
          const ws = new WebSocket(syncUrl);
          const timer = setTimeout(() => {
            ws.close();
            resolve({ label: "sync WebSocket", state: "fail", detail: `timeout: ${syncUrl}` });
          }, 5000);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.close();
            resolve({ label: "sync WebSocket", state: "pass", detail: syncUrl });
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve({ label: "sync WebSocket", state: "fail", detail: syncUrl });
          };
        } catch (e) {
          resolve({ label: "sync WebSocket", state: "fail", detail: String(e) });
        }
      });
      report(wsResult);

      report({ label: "server origin", state: "pass", detail: getServerOrigin() });
    }
    void run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-app bg-panel p-6 font-mono text-sm text-text">
      <h1 className="mb-4 text-base">arcan device diagnostics</h1>
      <ul className="space-y-2">
        {checks.length === 0 && <li className="text-dim">running checks…</li>}
        {checks.map((c) => (
          <li key={c.label} data-testid={`diag-${c.state}`}>
            <span className={c.state === "fail" ? "text-red" : "text-dim"}>
              [{c.state === "pass" ? "ok" : c.state === "fail" ? "FAIL" : ".."}]
            </span>{" "}
            {c.label}
            {c.detail ? <span className="text-dim"> — {c.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
