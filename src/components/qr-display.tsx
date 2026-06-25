import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/styles/use-theme";

interface QRDisplayProps {
  url: string;
  size?: number;
  showText?: boolean;
}

export function QRDisplay({ url, size = 300, showText = false }: QRDisplayProps) {
  // Re-render on theme flip. The concrete hexes come from the resolved CSS
  // variables below; reading the context here makes the component reactive.
  useTheme();

  // QRCodeSVG needs concrete colors (not CSS vars), so resolve them from the
  // document's computed style at render. Modules use --color-text, background
  // uses --color-panel (design intent: modules=text on a panel field).
  // Fallback to the dark-theme token hexes when no computed style is available
  // (e.g. jsdom under test, or pre-hydration).
  const root =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
  const fg = root?.getPropertyValue("--color-text").trim() || "#c8d1f0";
  const bg = root?.getPropertyValue("--color-panel").trim() || "#12141f";

  return (
    <div className="flex flex-col items-center gap-3" data-testid="qr-display">
      <div className="rounded-r-5 border border-hairline bg-panel p-4">
        <QRCodeSVG value={url} size={size} level="M" fgColor={fg} bgColor={bg} />
      </div>
      {showText && (
        <code className="break-all text-xs text-dim" data-testid="qr-url-text">
          {url}
        </code>
      )}
    </div>
  );
}
