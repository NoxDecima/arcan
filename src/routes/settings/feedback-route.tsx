import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/toast";
import { Icon } from "./settings-kit";

const CATEGORIES = ["bug", "idea", "question", "note"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  note: "Note",
};

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * FeedbackRoute (Unit 9-5b, 4-F): the dedicated /settings/feedback page.
 * Matches proto.jsx FeedbackScreen. Submission logic is preserved verbatim
 * from the former inline FeedbackSection: multipart POST to /api/feedback,
 * 10 MB cap, success/error toasts. The optional email field is appended to the
 * form (server currently derives email from the session; wiring is a follow-up).
 *
 * The kit Icon set has no send/paperclip/image/close glyphs, so the header back
 * affordance uses a rotated `chev`, the dropzone uses `plus`, and attachment
 * removal uses a plain text button (as the original inline form did).
 */
export function FeedbackRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
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
      if (category) body.set("category", CATEGORY_LABEL[category]);
      if (email.trim()) body.set("email", email.trim());
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      {/* PaneHeader: back + title (proto.jsx FeedbackScreen line 488) */}
      <header className="flex h-14 items-center gap-3 border-b border-hairline px-4">
        <button
          data-testid="feedback-back"
          aria-label="back"
          onClick={() => navigate("/settings")}
          className="text-text-2 hover:text-text"
        >
          <Icon d="chev" className="rotate-180" size={18} />
        </button>
        <h1 className="text-base font-semibold text-text">give feedback</h1>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
        <p className="text-sm text-text-2">
          found a bug or have an idea? tell me — it goes straight to the maker.
        </p>

        {/* your feedback */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            your feedback
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="what's on your mind?"
            className="min-h-28 resize-y rounded-r-3 border border-hairline bg-panel p-3 font-body text-sm text-text outline-none focus:border-arcan-accent"
            data-testid="feedback-message"
          />
        </div>

        {/* category · optional */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            category · optional
          </span>
          <div className="flex flex-wrap gap-2" data-testid="feedback-category">
            {CATEGORIES.map((k) => {
              const on = category === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(on ? null : k)}
                  data-testid={`feedback-category-${k}`}
                  className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    on
                      ? "border-accent-border bg-accent-soft text-arcan-accent"
                      : "border-hairline bg-transparent text-text-2 hover:bg-panel-2"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        {/* attachment · optional */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            attachment · optional
          </span>
          {files.length === 0 ? (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-r-3 border border-dashed border-hairline p-3 text-sm text-text-2 hover:bg-panel-2">
              <input
                type="file"
                multiple
                onChange={onFileChange}
                className="hidden"
                data-testid="feedback-file-input"
              />
              <Icon d="plus" className="text-text-2" size={15} />
              <span>add a screenshot (any type, ≤10 MB total)</span>
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-r-3 border border-hairline bg-panel p-2"
                >
                  <span
                    className="flex-1 truncate text-sm text-text"
                    title={f.name}
                  >
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
                <input
                  type="file"
                  multiple
                  onChange={onFileChange}
                  className="hidden"
                />
                + add more
              </label>
              <div className="text-xs text-dim">
                total: {Math.ceil(totalBytes / 1024)} KB /{" "}
                {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
                {overCap && <span className="ml-2 text-red">over cap</span>}
              </div>
            </div>
          )}
        </div>

        {/* email · optional */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            email · optional
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for follow-up — leave blank to stay anonymous"
            data-testid="feedback-email"
            className="h-10 rounded-r-3 border border-hairline bg-panel px-3 font-body text-sm text-text outline-none placeholder:text-dim focus:border-arcan-accent"
          />
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          data-testid="feedback-submit"
          className="inline-flex h-11 items-center justify-center gap-2 self-stretch rounded-pill bg-arcan-accent font-semibold text-on-accent disabled:opacity-50"
        >
          {submitting ? "sending…" : "submit feedback"}
        </button>
      </div>
    </div>
  );
}
