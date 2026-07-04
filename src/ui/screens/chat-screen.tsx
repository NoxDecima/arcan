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
import type { ChatTimelineItem, ChatHeaderVM } from "./chat-types";
import type { JSX } from "react";

export function ChatScreen({
  header,
  items,
  bubbleWidth,
  onBack,
  onOpenInfo,
  composer,
  banner,
  emptyText,
  bottomRef,
  timelineRef,
  headerLinkTestId,
  backBtnTestId,
  titleTestId,
  avatarTestId,
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
  /** Rung 4: ConnectionBanner slot above timeline */
  banner?: ReactNode;
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
      />

      {/* Rung 4: connection banner above timeline */}
      {banner}

      {/* Timeline — proto:184 cluster */}
      <div
        ref={timelineRef}
        data-testid="message-timeline"
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 p-3 bg-bg"
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
                        time: item.time,
                        att: item.att,
                        edited: item.edited,
                      }}
                      w={bubbleWidth}
                      attSlot={item.attSlot}
                      testId={item.mine ? "message-mine" : "message-other"}
                      bodyTestId="bubble-body"
                      timeTestId="bubble-time"
                      bodyOverride={item.bodyOverride}
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

      {/* Composer slot — container renders ChatComposer */}
      {composer}
    </>
  );
}
