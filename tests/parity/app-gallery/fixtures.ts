import type { ConvoItem, ContactItem } from "@/ui/screens";

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
