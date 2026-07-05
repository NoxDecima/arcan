// src/ui/screens — barrel export for home screen presenters and chat screen presenters.
// Pure (no Jazz, no router): enforced by scripts/check-ui-purity.sh.

export { ConvoRow, ContactRow } from "./rows";
export { ChatsScreen } from "./chats-screen";
export { ContactsScreen } from "./contacts-screen";
export { NavColumn } from "./nav-column";
export type { ConvoItem, ContactItem, HomeProfile } from "./home-types";
export { ChatScreen } from "./chat-screen";
export { ChatComposer } from "./chat-composer";
export type { ChatTimelineItem, ChatHeaderVM } from "./chat-types";
export { ProfileScreen } from "./profile-screen";
export { OwnProfileScreen } from "./own-profile-screen";
export type { ProfileScreenVM, OwnProfileScreenVM } from "./profile-types";
export { SettingsScreen } from "./settings-screen";
export { FeedbackScreen } from "./feedback-screen";
export { LinkDeviceScreen } from "./link-device-screen";
export type {
  SettingsAccountVM,
  SettingsToggleRow,
  SettingsDeviceRow,
  ThemeName,
} from "./settings-types";
export { ConvoSettingsScreen } from "./convo-settings-screen";
export { NewConvoScreen } from "./new-convo-screen";
export { AddPeopleScreen } from "./add-people-screen";
export { AddContactScreen } from "./add-contact-screen";
export type { PickItem, ConvoMemberVM } from "./picker-types";
