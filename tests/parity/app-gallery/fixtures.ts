import type { ConvoItem, ContactItem, ChatTimelineItem, ProfileScreenVM, OwnProfileScreenVM } from "@/ui/screens";

// Fixtures mirroring HF_CONVOS / HF_CONTACTS from design/hf-kit.jsx.
// "·" = U+00B7 (middle dot). No avatarSrc — initials-only for parity cells.
export const HF_CONVOS: ConvoItem[] = [
  { id: "c1", name: "ada · keyring",   initials: "AK", preview: "take a look when you can", time: "9:25", unread: 2 },
  { id: "c2", name: "retrieval-squad", initials: "RS", group: true, preview: "rana: 40ms p99 now", time: "Tue", unread: 5 },
  { id: "c3", name: "jun mori",        initials: "JM", preview: "sent the schema diff",      time: "Tue", unread: 0 },
  { id: "c4", name: "theo z.",         initials: "TZ", preview: "sow-042.md",                time: "Mon", unread: 0 },
  { id: "c5", name: "eli · device-2",  initials: "EL", preview: "you: pulled, thanks",       time: "Mon", unread: 0 },
];
export const HF_CONTACTS: ContactItem[] = [
  { id: "ct1", name: "ada · keyring",  initials: "AK" },
  { id: "ct2", name: "eli · device-2", initials: "EL" },
  { id: "ct3", name: "jun mori",       initials: "JM" },
  { id: "ct4", name: "rana",           initials: "RA" },
  { id: "ct5", name: "theo z.",        initials: "TZ" },
  { id: "ct6", name: "nox / ops",      initials: "NX" },
];

// HF_CHAT_ITEMS mirrors design/hf-kit.jsx:HF_MSGS + the proto:185 "today" day marker
// rendered at the top of the ChatScreen timeline.
// SEED['ada · keyring'] === HF_MSGS; proto renders: day-marker "today", then msgs.map(Row).
export const HF_CHAT_ITEMS: ChatTimelineItem[] = [
  { kind: "day",  label: "today", key: "day-today" },
  { kind: "sys",  text: "conversation created · end-to-end encrypted", key: "sys-0" },
  { kind: "msg",  mine: false, text: "schema diff looks good — merging now", time: "9:18", authorName: "ada", authorInitials: "AK", key: "msg-1" },
  { kind: "msg",  mine: true,  text: "nice. shipping it tonight.", time: "9:22", key: "msg-2" },
  { kind: "msg",  mine: true,  att: true, text: "sow-042.png", time: "9:22", key: "msg-3" },
  { kind: "new",  key: "new-0" },
  { kind: "msg",  mine: false, text: "pushed a fix — 40ms p99 now", time: "9:24", authorName: "ada", authorInitials: "AK", key: "msg-5" },
  { kind: "msg",  mine: false, text: "take a look when you can", time: "9:25", authorName: "ada", authorInitials: "AK", key: "msg-6" },
];

// Profile screen fixtures — mirroring proto.jsx:205–259 placeholder values.
// "…" = U+2026 HORIZONTAL ELLIPSIS (proto hardcodes "co_z1a8…4f2").
export const PROFILE_FIXTURE: ProfileScreenVM = {
  name: "ada · keyring",   // no "@" — rule 4
  initials: "AK",
  idShort: "co_z1a8…4f2",
  // sharedConversations: undefined → renders proto "soon" row
};
export const OWN_PROFILE_FIXTURE: OwnProfileScreenVM = {
  name: "decima",
  initials: "me",
  idShort: "co_z1a8…4f2",
};
