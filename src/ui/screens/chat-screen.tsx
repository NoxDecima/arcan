// src/ui/screens/chat-screen.tsx — pure chat screen presenter.
// Node-for-node port of design/proto.jsx:154–203 (ChatScreen).
/* patched copy: design/proto.jsx:154–203 — typing + presence/verified dropped (NOX-31/33) */
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode } from "react";
import type { Ref } from "react";
import { Fragment } from "react";
import { HAv } from "../kit/hav";
import { PHeader } from "../kit/pheader";
import { MessageRow } from "../kit/bubble";
import { Icon } from "../kit/icon";
import type { ChatTimelineItem, ChatHeaderVM } from "./chat-types";
import type { JSX } from "react";

export function ChatScreen({
  header,
  items,
  bubbleWidth,
  onBack,
  onOpenInfo,
  composer,
  overlay,
  jumpToLatest,
  emptyText,
  bottomRef,
  timelineRef,
  headerLinkTestId,
  backBtnTestId,
  titleTestId,
  avatarTestId,
  headerRight,
}: {
  header: ChatHeaderVM;
  items: ChatTimelineItem[];
  /** desktop 460 / mobile 190 (proto:186) */
  bubbleWidth: number;
  /** mobile only (proto: desktop ? undefined : pop) */
  onBack?: () => void;
  /** header tap → members/profile */
  onOpenInfo: () => void;
  /** ChatComposer (or legacy container-wrapped variant) */
  composer: ReactNode;
  /** Floating status slot between header and timeline (feedback R4) — the
   * container passes a zero-height overlay (SyncStatusPill) whose content
   * floats over the timeline top; it costs no layout space. */
  overlay?: ReactNode;
  /** Floating "jump to latest" control (feedback round 5, relabelled round 6).
   * Rendered in a zero-height context above the composer; visible only when
   * the user has scrolled away from the bottom. */
  jumpToLatest?: {
    visible: boolean;
    onClick: () => void;
  };
  /** Rung 4: empty-state text */
  emptyText?: string;
  /** container's autoscroll anchor */
  bottomRef?: Ref<HTMLDivElement>;
  /** Container seam: the scrollable timeline element, for direct scrollTop
   * positioning (scrollIntoView proved unreliable across scroll ancestors). */
  timelineRef?: Ref<HTMLDivElement>;
  /** Sanctioned: data-testid on the PHeader title button (e.g. "conversation-header-link"). */
  headerLinkTestId?: string;
  /** Sanctioned: data-testid on the PHeader back button (e.g. "chat-back-arrow"). */
  backBtnTestId?: string;
  /** Sanctioned: data-testid on the title text (e.g. "conversation-title"). */
  titleTestId?: string;
  /** Sanctioned: data-testid on the HAv avatar (e.g. "conversation-header-avatar"). */
  avatarTestId?: string;
  /** intent-fix (feedback round 2): header overflow menu slot (⋮). Parity
   * cells omit it — PHeader's right slot renders nothing by default. */
  headerRight?: ReactNode;
}): JSX.Element {
  // Sub text — rendered only when header.sub is set (groups only; 1:1 presence dropped NOX-31/33).
  // v5 headMono=true + sysComment=true: font-mono, "// " prefix. proto:177.
  const sub = header.sub ? (
    <span className="font-mono text-ui-chatsub text-text-2">
      {"// "}
      {header.sub}
    </span>
  ) : undefined;

  return (
    <>
      {/* Header — proto:182–183: PHeader with avatar HAv 34, no status (NOX-31/33). */}
      <PHeader
        title={header.title}
        sub={sub}
        onBack={onBack}
        avatar={
          <HAv
            txt={header.initials}
            src={header.avatarSrc}
            size={34}
            group={header.group}
            testId={avatarTestId}
          />
        }
        onTitle={onOpenInfo}
        titleButtonTestId={headerLinkTestId}
        backTestId={backBtnTestId}
        titleTestId={titleTestId}
        right={headerRight}
      />

      {/* Floating status overlay (sync pill) — zero-height, above timeline */}
      {overlay}

      {/* Timeline — proto:184 cluster */}
      <div
        ref={timelineRef}
        data-testid="message-timeline"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2.5 p-3 bg-bg"
      >
        {items.length === 0 && emptyText ? (
          <div className="self-center font-body text-ui-sub text-dim py-8">
            {emptyText}
          </div>
        ) : (
          items.map((item) => {
            switch (item.kind) {
              case "day":
                // Day marker — proto:185: 500 9px/1 mono .14em caps, self-center.
                return (
                  <div
                    key={item.key}
                    className="font-mono font-medium text-ui-caps tracking-caps-sm uppercase text-dim self-center"
                  >
                    {item.label}
                  </div>
                );

              case "new":
                // New-messages divider — kit MessageRow new branch (proto:56–60).
                return (
                  <MessageRow
                    key={item.key}
                    m={{ who: "new" }}
                    w={bubbleWidth}
                    testId="new-messages-divider"
                  />
                );

              case "sys":
                // Sys row — kit MessageRow sys branch (proto:53–55).
                return (
                  <MessageRow
                    key={item.key}
                    m={{ who: "sys", text: item.text }}
                    w={bubbleWidth}
                    testId={item.testId}
                  />
                );

              case "msg": {
                // Rung-4: deleted / malformed → plain theirs-style bubble shell.
                if (item.deleted || item.malformed) {
                  const mine = item.mine;
                  return (
                    <div
                      key={item.key}
                      className={`flex gap-2 items-end ${mine ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {!mine && item.authorInitials && (
                        <HAv
                          txt={item.authorInitials}
                          src={item.authorAvatarSrc}
                          size={28}
                        />
                      )}
                      <div
                        className={[
                          "bg-panel border border-hairline rounded-r-5 px-[11px] py-2",
                          mine ? "rounded-br-r-1" : "rounded-bl-r-1",
                        ].join(" ")}
                        data-testid={
                          item.deleted ? "message-deleted" : "message-malformed"
                        }
                      >
                        <span className="font-body text-ui-bubble text-dim italic">
                          {item.deleted ? "message deleted" : "malformed message"}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Normal message row — proto:186: Row per item, w=bubbleWidth.
                return (
                  <Fragment key={item.key}>
                    <MessageRow
                      m={{
                        who: item.mine ? "me" : "them",
                        text: item.text,
                        name: item.authorName,
                        ini: item.authorInitials,
                        src: item.authorAvatarSrc,
                        time: item.time,
                        att: item.att,
                        edited: item.edited,
                      }}
                      w={bubbleWidth}
                      attSlot={item.attSlot}
                      onAvatar={item.onAvatar}
                      testId={item.mine ? "message-mine" : "message-other"}
                      bodyTestId="bubble-body"
                      timeTestId="bubble-time"
                      bodyOverride={item.bodyOverride}
                      onContext={item.onContext}
                      entering={item.entering}
                      // Rung 4: edit/delete menu — beside the bubble in the
                      // row gutter (walkthrough feedback 2026-07-05), not a
                      // stray row below it.
                      endSlot={item.menuSlot}
                    />
                  </Fragment>
                );
              }

              default:
                return null;
            }
          })
        )}

        {/* Autoscroll anchor — container attaches bottomRef here */}
        <div ref={bottomRef} />
      </div>

      {/* Jump-to-latest — zero-height context; button floats above composer */}
      {jumpToLatest?.visible && (
        <div className="relative z-10 h-0">
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <button
              type="button"
              data-testid="jump-to-latest"
              onClick={jumpToLatest.onClick}
              aria-label="Jump to latest messages"
              className="pointer-events-auto flex items-center gap-1.5 rounded-pill border border-hairline bg-panel px-3 py-[6px] shadow-level-1 transition-tint duration-fast ease-out hover:bg-panel-2 active:bg-hairline animate-arcan-rise"
            >
              <Icon d="chev" size={16} className="text-text-2 rotate-90" />
              <span className="font-mono font-medium text-ui-caps tracking-caps-sm uppercase text-text-2">
                jump to latest
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Composer slot — container renders ChatComposer */}
      {composer}
    </>
  );
}
