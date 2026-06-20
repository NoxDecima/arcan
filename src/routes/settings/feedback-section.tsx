import { useState } from "react";
import { useToast } from "@/components/toast";

const CATEGORIES = ["bug", "idea", "question", "note"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  note: "Note",
};

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export function FeedbackSection() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const overCap = totalBytes > MAX_TOTAL_BYTES;
  const canSubmit = message.trim().length > 0 && !overCap && !submitting;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("message", message.trim());
      if (category) body.set("category", CATEGORY_LABEL[category]);
      for (const f of files) body.append("attachment", f);
      const res = await fetch("/api/feedback", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ icon: "check", text: "thanks — feedback sent", tone: "success" });
      setMessage("");
      setCategory(null);
      setFiles([]);
    } catch (err) {
      console.error("[feedback] submit failed:", err);
      toast({ icon: "alert", text: "couldn't send — try again", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 max-w-xl">
      <h2 className="text-base font-semibold text-text">give feedback</h2>
      <p className="text-sm text-text-2">
        found a bug or have an idea? tell us — it goes straight to the maker. we'll know it's from your account.
      </p>

      {/* Message */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">Your feedback</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="what's on your mind?"
          className="min-h-28 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm p-3 resize-y outline-none focus:border-arcan-accent"
          data-testid="feedback-message"
        />
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">Category · optional</span>
        <div className="flex gap-2 flex-wrap" data-testid="feedback-category">
          {CATEGORIES.map((k) => {
            const on = category === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(on ? null : k)}
                data-testid={`feedback-category-${k}`}
                className={`px-3 py-1.5 rounded-pill text-xs font-semibold border transition-colors ${
                  on
                    ? "bg-accent-soft text-arcan-accent border-accent-border"
                    : "bg-transparent text-text-2 border-hairline hover:bg-panel-2"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      {/* Attachments */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
          Attachments · optional
        </span>
        {files.length === 0 ? (
          <label className="flex items-center justify-center gap-2 p-3 rounded-r-3 border border-dashed border-hairline cursor-pointer text-text-2 text-sm hover:bg-panel-2">
            <input type="file" multiple onChange={onFileChange} className="hidden" data-testid="feedback-file-input" />
            <span>attach files (any type, ≤10 MB total)</span>
          </label>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-r-3 border border-hairline bg-panel">
                <span className="flex-1 text-sm text-text truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="text-xs text-dim flex-shrink-0">{Math.ceil(f.size / 1024)} KB</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-xs text-text-2 hover:text-red px-2 py-1"
                  data-testid={`feedback-file-remove-${i}`}
                >
                  remove
                </button>
              </div>
            ))}
            <label className="text-xs text-arcan-accent cursor-pointer self-start">
              <input type="file" multiple onChange={onFileChange} className="hidden" />
              + add more
            </label>
            <div className="text-xs text-dim">
              Total: {Math.ceil(totalBytes / 1024)} KB / {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
              {overCap && <span className="text-red ml-2">over cap</span>}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        data-testid="feedback-submit"
        className="self-start px-4 h-10 rounded-r-3 bg-arcan-accent text-on-accent font-semibold disabled:opacity-50"
      >
        {submitting ? "sending…" : "submit feedback"}
      </button>
    </section>
  );
}
