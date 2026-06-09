import { QRCodeSVG } from "qrcode.react";

interface QRDisplayProps {
  url: string;
  size?: number;
  showText?: boolean;
}

export function QRDisplay({ url, size = 256, showText = false }: QRDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid="qr-display">
      <div className="rounded-lg border bg-panel p-4">
        <QRCodeSVG value={url} size={size} level="M" />
      </div>
      {showText && (
        <code
          className="break-all text-xs text-muted-foreground"
          data-testid="qr-url-text"
        >
          {url}
        </code>
      )}
    </div>
  );
}
