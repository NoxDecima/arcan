import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { useToast } from "@/components/toast";
import { FeedbackScreen } from "@/ui/screens/feedback-screen";
import { authFetch } from "@/platform/auth-transport";
import { pickFilesNative } from "@/platform/files";

const CATEGORIES: [string, string][] = [
  ["bug", "Bug"],
  ["idea", "Idea"],
  ["question", "Question"],
  ["note", "Note"],
];

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * FeedbackRoute (Unit 9-5b → Wave C): container for /settings/feedback.
 *
 * All submission logic is preserved verbatim from the original hand-rolled
 * FeedbackRoute: multipart POST to /api/feedback, 10 MB cap, success/error
 * toasts, navigate back on success. The attachment UI (file chips + dropzone)
 * is rendered here as attachmentSlot — the FeedbackScreen presenter is pure.
 */
export function FeedbackRoute() {
  const navigate = useNavigate();
  const goUp = useUpNavigation();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // email state removed (user decision, 2026-07-05 walkthrough): inferred server-side
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const overCap = totalBytes > MAX_TOTAL_BYTES;
  const canSubmit = message.trim().length > 0 && !overCap && !submitting;

  function ingestFiles(newFiles: File[]) {
    setFiles((prev) => [...prev, ...newFiles]);
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    ingestFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  async function openPicker(inputRef: React.RefObject<HTMLInputElement | null>) {
    try {
      const native = await pickFilesNative({ multiple: true, maxBytes: MAX_TOTAL_BYTES });
      if (native !== null) {
        if (native.length > 0) ingestFiles(native);
        return;
      }
    } catch (err) {
      toast({
        icon: "alert",
        text: err instanceof Error ? err.message : "pick failed — try again.",
        tone: "error",
      });
      return;
    }
    inputRef.current?.click();
  }

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("message", message.trim());
      const found = CATEGORIES.find(([k]) => k === category);
      if (found) body.set("category", found[1]);
      // email field removed — server infers from authenticated account session
      for (const f of files) body.append("attachment", f);
      const res = await authFetch("/api/feedback", {
        method: "POST",
        body,
        credentials: "include",
      });
      if (res.status === 404) {
        // The api registers /api/feedback only when LINEAR_API_TOKEN is set
        // (api/src/index.ts) — a 404 means this server isn't configured for
        // feedback, not a transient failure. Don't suggest retrying.
        toast({
          icon: "alert",
          text: "feedback isn't set up on this server",
          tone: "error",
        });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ icon: "check", text: "thanks — feedback sent", tone: "success" });
      navigate("/settings");
    } catch (err) {
      console.error("[feedback] submit failed:", err);
      toast({ icon: "alert", text: "couldn't send — try again", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── attachment slot ───────────────────────────────────────────────────────
  const attachmentSlot =
    files.length === 0 ? (
      <div
        className="flex cursor-pointer items-center justify-center gap-2 rounded-r-3 border border-dashed border-hairline p-3 text-sm text-text-2 hover:bg-panel-2"
        onClick={() => void openPicker(fileInputRef)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void openPicker(fileInputRef); } }}
      >
        {/* Hidden input keeps data-testid for Playwright setInputFiles */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onFileChange}
          className="hidden"
          data-testid="feedback-file-input"
          onClick={(e) => e.stopPropagation()}
        />
        <span>add a screenshot (any type, ≤10 MB total)</span>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {files.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-r-3 border border-hairline bg-panel p-2"
          >
            <span className="flex-1 truncate text-sm text-text" title={f.name}>
              {f.name}
            </span>
            <span className="flex-shrink-0 text-xs text-dim">
              {Math.ceil(f.size / 1024)} KB
            </span>
            <button
              type="button"
              onClick={() => removeFile(i)}
              className="px-2 py-1 text-xs text-text-2 hover:text-red"
              aria-label="remove attachment"
              data-testid={`feedback-file-remove-${i}`}
            >
              remove
            </button>
          </div>
        ))}
        {/* Hidden input for Playwright; native path goes through openPicker */}
        <input
          ref={addMoreInputRef}
          type="file"
          multiple
          onChange={onFileChange}
          className="hidden"
        />
        <button
          type="button"
          className="cursor-pointer self-start text-xs text-arcan-accent"
          onClick={() => void openPicker(addMoreInputRef)}
        >
          + add more
        </button>
        <div className="text-xs text-dim">
          total: {Math.ceil(totalBytes / 1024)} KB /{" "}
          {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
          {overCap && <span className="ml-2 text-red">over cap</span>}
        </div>
      </div>
    );

  return (
    <FeedbackScreen
      onBack={() => goUp()}
      message={message}
      onMessage={setMessage}
      category={category}
      categories={CATEGORIES}
      onCategory={(k) => setCategory((prev) => (prev === k ? null : k))}
      attachmentSlot={attachmentSlot}
      canSubmit={canSubmit}
      submitting={submitting}
      onSubmit={() => void submit()}
      // testid carries
      backTestId="feedback-back"
      messageTestId="feedback-message"
      categoryContainerTestId="feedback-category"
      submitTestId="feedback-submit"
    />
  );
}
