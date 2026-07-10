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

      results.push({
        label: "environment",
        state: "pass",
        detail: `origin=${window.location.origin} tauri=${isTauri()} android=${isTauriAndroid()}`,
      });

      results.push({
        label: "secure context",
        state: window.isSecureContext ? "pass" : "fail",
      });

      results.push({
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
        results.push({ label: "WASM (hash-wasm argon2id)", state: hash.length === 32 ? "pass" : "fail" });
      } catch (e) {
        results.push({ label: "WASM (hash-wasm argon2id)", state: "fail", detail: String(e) });
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("arcan-diag", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("kv");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("kv", "readwrite");
            tx.objectStore("kv").put(Date.now(), "probe");
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
        results.push({ label: "IndexedDB write", state: "pass" });
      } catch (e) {
        results.push({ label: "IndexedDB write", state: "fail", detail: String(e) });
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
      results.push(wsResult);

      results.push({ label: "server origin", state: "pass", detail: getServerOrigin() });

      if (alive) setChecks(results);
    }
    void run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-panel p-6 font-mono text-sm text-text">
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
