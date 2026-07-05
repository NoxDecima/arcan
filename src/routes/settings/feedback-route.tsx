import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/toast";
import { FeedbackScreen } from "@/ui/screens/feedback-screen";

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
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // email state removed (user decision, 2026-07-05 walkthrough): inferred server-side
  const [submitting, setSubmitting] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const overCap = totalBytes > MAX_TOTAL_BYTES;
  const canSubmit = message.trim().length > 0 && !overCap && !submitting;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };
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
      const res = await fetch("/api/feedback", {
        method: "POST",
        body,
        credentials: "include",
      });
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
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-r-3 border border-dashed border-hairline p-3 text-sm text-text-2 hover:bg-panel-2">
        <input
          type="file"
          multiple
          onChange={onFileChange}
          className="hidden"
          data-testid="feedback-file-input"
        />
        <span>add a screenshot (any type, ≤10 MB total)</span>
      </label>
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
        <label className="cursor-pointer self-start text-xs text-arcan-accent">
          <input type="file" multiple onChange={onFileChange} className="hidden" />
          + add more
        </label>
        <div className="text-xs text-dim">
          total: {Math.ceil(totalBytes / 1024)} KB /{" "}
          {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
          {overCap && <span className="ml-2 text-red">over cap</span>}
        </div>
      </div>
    );

  return (
    <FeedbackScreen
      onBack={() => navigate("/settings")}
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
