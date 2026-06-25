import { Icon } from "@/components/icon";

/**
 * Fab — bottom-right floating action button (Unit 9-3, item 2-C).
 *
 * Replaces the old "+" in the sidebar header. Pill, accent fill, drop
 * shadow, `position: absolute` within its scroll/list container. On mobile
 * it floats *above* the 56px bottom tab bar (`MobileTabBar`) plus the iOS
 * safe-area inset; on desktop the tab bar isn't present but the extra 56px
 * is harmless because the desktop list column is taller than its content.
 *
 * Design values: 52x52, pill, `bg-arcan-accent`, `text-on-accent`,
 * `shadow-level-2`, `right:16 bottom:16` (proto.jsx:145 + DesktopApp FAB).
 */
interface FabProps {
  /** Accessible label, e.g. "New chat" / "Add a contact". */
  label: string;
  onClick: () => void;
  "data-testid"?: string;
}

export function Fab({
  label,
  onClick,
  "data-testid": testId = "fab",
}: FabProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute right-4 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-arcan-accent text-on-accent shadow-level-2"
      style={{
        // Float above the 56px MobileTabBar + iOS safe area on mobile.
        // env() resolves to 0px on desktop; the tab bar is also hidden there
        // so the extra 56px is harmless (the column is taller than content).
        // Wrapped in calc() so jsdom's CSSOM parses it during unit tests.
        bottom: "calc(16px + 56px + env(safe-area-inset-bottom))",
      }}
    >
      <Icon name="plus" size={22} strokeWidth={2.2} />
    </button>
  );
}
