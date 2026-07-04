// src/ui/screens/feedback-screen.tsx — feedback presenter.
// Node-for-node port of design/proto.jsx:487–531 (FeedbackScreen).
//
// patched-copy rules: state lifted to container (message/category/email/submitting);
// attachmentSlot accepted as ReactNode (container owns file state);
// categories prop-driven (app uses bug/idea/question/note; proto uses praise).
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, PButton, tapClass, Icon } from "../kit";

export function FeedbackScreen({
  onBack,
  message,
  onMessage,
  category,
  categories,
  onCategory,
  attachmentSlot,
  email,
  onEmail,
  canSubmit,
  submitting,
  onSubmit,
  // testid carries
  backTestId,
  messageTestId,
  categoryContainerTestId,
  emailTestId,
  submitTestId,
}: {
  onBack: () => void;
  message: string;
  onMessage: (v: string) => void;
  category: string | null;
  /** [key, label] pairs — app uses bug/idea/question/note; proto parity uses its own set. */
  categories: [string, string][];
  onCategory: (k: string) => void;
  /** Rung-4: dropzone / file chips (container owns files). Parity: static dropzone fixture. */
  attachmentSlot?: ReactNode;
  email: string;
  onEmail: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  // testid carries
  backTestId?: string;                  // "feedback-back"
  messageTestId?: string;               // "feedback-message"
  categoryContainerTestId?: string;     // "feedback-category"
  emailTestId?: string;                 // "feedback-email"
  submitTestId?: string;                // "feedback-submit"
}): JSX.Element {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PHeader
        title="give feedback"
        onBack={onBack}
        backTestId={backTestId}
      />

      {/* Body pad={16} — proto:489 */}
      <Body pad={16}>
        {/* maxWidth 520 column gap 16 — proto:490 */}
        <div className="flex flex-col gap-4 max-w-[520px] w-full mx-auto">

          {/* intro paragraph — proto:491 */}
          {/* 400 11.5px/1.5 body → font-body text-ui-empty-sub leading-normal */}
          <div className="font-body text-ui-empty-sub leading-normal text-text-2">
            found a bug or have an idea? tell me — it goes straight to the maker.
          </div>

          {/* your feedback — proto:493–498 */}
          <div className="flex flex-col gap-[6px]">
            {/* 600 9px/1 mono .14em caps → font-mono font-semibold text-ui-caps tracking-caps-sm uppercase */}
            <span className="font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim">
              your feedback
            </span>
            {/* textarea — cluster */}
            <textarea
              value={message}
              onChange={(e) => onMessage(e.target.value)}
              placeholder="what's on your mind?"
              data-testid={messageTestId}
              className="min-h-[110px] resize-none rounded-r-4 border border-hairline bg-panel text-text px-3 py-[11px] font-body text-ui-row leading-normal outline-none"
              style={{ caretColor: "var(--color-accent-fill)" }}
            />
          </div>

          {/* category · optional — proto:500–508 */}
          <div className="flex flex-col gap-2">
            <span className="font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim">
              category · optional
            </span>
            {/* chip row — cluster */}
            <div
              className="flex gap-2 flex-wrap"
              data-testid={categoryContainerTestId}
            >
              {categories.map(([k, lb]) => {
                const on = category === k;
                return (
                  <button
                    key={k}
                    onClick={() => onCategory(k)}
                    data-testid={`feedback-category-${k}`}
                    className={[
                      tapClass,
                      "px-[13px] py-[7px] rounded-pill font-mono font-semibold text-ui-value border",
                      on
                        ? "border-accent-border bg-accent-soft text-arcan-accent"
                        : "border-hairline bg-transparent text-text-2",
                    ].join(" ")}
                  >
                    {lb}
                  </button>
                );
              })}
            </div>
          </div>

          {/* attachment · optional — proto:510–523 */}
          <div className="flex flex-col gap-2">
            <span className="font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim">
              attachment · optional
            </span>
            {/* Rung-4: attachmentSlot from container (file chips / dropzone) */}
            {attachmentSlot ?? (
              /* Fallback static dropzone — matches proto empty state (proto:520–522) */
              <button
                type="button"
                className={`${tapClass} flex w-full justify-center gap-2 p-3 rounded-r-4 border border-dashed border-hairline bg-transparent`}
              >
                <Icon d="paperclip" size={15} className="text-text-2" />
                {/* 500 11.5px/1 body → font-body font-medium text-ui-empty-sub */}
                <span className="font-body font-medium text-ui-empty-sub text-text-2">
                  add a screenshot
                </span>
              </button>
            )}
          </div>

          {/* email · optional — proto:527 (PField-style label + real input) */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim">
              email · optional
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              placeholder="for follow-up — leave blank to stay anonymous"
              data-testid={emailTestId}
              className="h-10 rounded-r-4 border border-hairline bg-panel px-3 font-body text-ui-row text-text placeholder:text-dim outline-none"
              style={{ caretColor: "var(--color-accent-fill)" }}
            />
          </div>

          {/* submit button — proto:529 */}
          <div style={{ opacity: canSubmit ? 1 : 0.5 }}>
            <PButton
              primary
              full
              icon="send"
              label={submitting ? "sending…" : "submit feedback"}
              onClick={onSubmit}
              data-testid={submitTestId}
            />
          </div>

        </div>
      </Body>
    </div>
  );
}
