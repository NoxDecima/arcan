import type {
  ConvoItem,
  ContactItem,
  ChatTimelineItem,
  ProfileScreenVM,
  OwnProfileScreenVM,
  SettingsAccountVM,
  SettingsToggleRow,
  SettingsDeviceRow,
  PickItem,
  ConvoMemberVM,
  ContactRequestVM,
  ApproveDeviceVM,
} from "@/ui/screens";

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

// ── Settings cluster fixtures (Task 3) ──────────────────────────────────────
// Mirrors the proto.jsx SettingsScreen placeholder values.

export const SETTINGS_ACCOUNT_FIXTURE: SettingsAccountVM = {
  name: "decima",
  initials: "me",
};

/** Accent keys matching ACCENT_KEYS from design/hf-kit.jsx. */
export const ACCENT_KEYS_FIXTURE = [
  "tokyo",
  "violet",
  "teal",
  "lime",
  "amber",
  "rose",
];

/** Solid hex per accent key — mirrors ACCENT_SWATCH from appearance-section.tsx. */
export const ACCENT_SOLID: Record<string, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

/** Proto's two notification rows; initial on=true matches proto's useState(true). */
export const SETTINGS_NOTIF_FIXTURE: SettingsToggleRow[] = [
  {
    key: "notif",
    label: "new messages",
    on: true,
    onToggle: () => {},
    ariaLabel: "new messages",
    icon: "bell",
  },
  {
    key: "ment",
    label: "mentions only",
    sub: "for group conversations",
    on: true,
    onToggle: () => {},
    ariaLabel: "mentions only",
    icon: "at",
  },
];

/** Proto's device row (link-a-device is the fixed footer row, not in this array). */
export const SETTINGS_DEVICES_FIXTURE: SettingsDeviceRow[] = [
  { key: "dev0", label: "this device · macbook", value: "active now" },
];

// ── Picker cluster fixtures (Task 4) ────────────────────────────────────────

/**
 * ConvoSettings MEMBERS fixture — mirrors design/proto.jsx:12–14 (MEMBERS).
 * proto-local (not exposed on window); re-defined in both proto-cells.jsx and here.
 * admins: DC (decima, you), RA (rana)
 * writers: JM (jun mori), AK (ada), TZ (theo z.)
 */
export const CONVO_MEMBERS_ADMINS: ConvoMemberVM[] = [
  { accountID: "DC", name: "decima", initials: "DC", role: "admin", you: true },
  { accountID: "RA", name: "rana",   initials: "RA", role: "admin" },
];
export const CONVO_MEMBERS_WRITERS: ConvoMemberVM[] = [
  { accountID: "JM", name: "jun mori", initials: "JM", role: "writer" },
  { accountID: "AK", name: "ada",      initials: "AK", role: "writer" },
  { accountID: "TZ", name: "theo z.",  initials: "TZ", role: "writer" },
];

/**
 * AddPeople pool fixture — mirrors design/proto.jsx:435 (pool).
 * proto-local; same values re-defined here.
 */
export const ADD_PEOPLE_POOL: PickItem[] = [
  { id: "ap0", name: "eli · device-2", initials: "EL" },
  { id: "ap1", name: "nox / ops",      initials: "NX" },
  { id: "ap2", name: "ko shin",        initials: "KS" },
  { id: "ap3", name: "mara p.",        initials: "MP" },
];

/** AddContact TTL presets (app values — 1h/24h/7d; proto uses 1d/7d/30d/∞; deviation noted in manifest). */
export const ADD_CONTACT_TTL_OPTIONS = ["1h", "24h", "7d"] as const;

// ── Auth / invite cluster fixtures (Task 4) ─────────────────────────────────

/**
 * ContactRequest fixture — mirrors hf-flows.jsx ScContactRequest placeholder values.
 * "rana" / "RA" / id "co_9f2…b41" (id field retained on VM; not rendered in UI —
 * user decision 2026-07-06: no raw ids in UI, Wave-C pattern).
 */
export const CONTACT_REQUEST_FIXTURE: ContactRequestVM = {
  name: "rana",
  initials: "RA",
  idShort: "co_9f2…b41",
};

/**
 * ApproveDevice fixture — mirrors hf-flows.jsx ScApproveDevice fixture rows.
 * Parity uses device/location/time (hf-faithful); live app substitutes
 * device/first-seen/fingerprint (app has no geo-location — documented divergence).
 */
export const APPROVE_DEVICE_FIXTURE: ApproveDeviceVM = {
  rows: [
    { label: "device",   value: "firefox · macos" },
    { label: "location", value: "prague · cz" },
    { label: "time",     value: "23:42 CET" },
  ],
};
