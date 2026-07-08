import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui/button";

interface QRScannerProps {
  onUrl: (url: string) => void;
  expectedPathPrefix: string;
}

type CameraState = "loading" | "running" | "denied" | "unavailable";

export function QRScanner({ onUrl, expectedPathPrefix }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A code WAS detected but didn't match expectedPathPrefix — e.g. an /invite
  // QR held up to the /pair scanner. Surfaced as a hint below the camera so a
  // wrong-kind scan doesn't read as "nothing happens" (walkthrough fix,
  // 2026-07-08).
  const [mismatch, setMismatch] = useState(false);
  const accepted = useRef(false);

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (accepted.current) return;
        if (!result.data.includes(expectedPathPrefix)) {
          setMismatch(true);
          return;
        }
        accepted.current = true;
        setMismatch(false);
        onUrl(result.data);
      },
      { returnDetailedScanResult: true }
    );

    scanner
      .start()
      .then(() => {
        if (cancelled) {
          scanner.stop();
          return;
        }
        scannerRef.current = scanner;
        setCameraState("running");
      })
      .catch(() => {
        if (!cancelled) setCameraState("denied");
      });

    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
    };
  }, [onUrl, expectedPathPrefix]);

  function handlePasteSubmit() {
    if (accepted.current) return;
    const trimmed = pasteValue.trim();
    if (!trimmed.includes(expectedPathPrefix)) {
      setError(`URL does not look like a valid ${expectedPathPrefix} link.`);
      return;
    }
    accepted.current = true;
    setError(null);
    onUrl(trimmed);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">scan with camera</h3>
        <div className="aspect-square w-full overflow-hidden rounded-lg border bg-black">
          {(cameraState === "loading" || cameraState === "running") && (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              data-testid="qr-camera-video"
            />
          )}
          {cameraState === "denied" && (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
              camera unavailable — paste the link instead.
            </div>
          )}
        </div>
        {mismatch && (
          <p className="text-sm text-dim" data-testid="qr-mismatch">
            that QR code was read, but it isn&apos;t the kind this screen
            expects (looking for a{" "}
            <span className="font-mono">{expectedPathPrefix}</span> link). if
            this keeps happening, paste the link instead.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">or paste link</h3>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm font-mono"
          rows={4}
          value={pasteValue}
          onChange={(e) => {
            setPasteValue(e.target.value);
            setError(null);
          }}
          placeholder={`paste a link containing "${expectedPathPrefix}"...`}
          data-testid="qr-paste-input"
        />
        {error && (
          <p className="text-sm text-red-600" data-testid="qr-paste-error">
            {error}
          </p>
        )}
        <Button
          onClick={handlePasteSubmit}
          disabled={!pasteValue.trim()}
          data-testid="qr-paste-submit"
        >
          use this link
        </Button>
      </div>
    </div>
  );
}
