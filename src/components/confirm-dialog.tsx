import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { PButton } from "@/ui/kit";

export type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Default "cancel". */
  cancelLabel?: string;
  /** Danger styling on the confirm button. Default true (destructive confirms). */
  danger?: boolean;
  /** data-testid on the dialog card. Default "confirm-dialog". */
  testId?: string;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation, replacing native confirm() (feedback round 2:
 * all confirmations use the modal style). Resolves false on cancel, Esc, or
 * scrim click. Throws only when INVOKED without a <ConfirmProvider> so that
 * components can render under test without the provider.
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  return useCallback<ConfirmFn>(
    (opts) => {
      if (!fn) throw new Error("useConfirm requires <ConfirmProvider>");
      return fn(opts);
    },
    [fn],
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // Requests can't stack (native confirm() couldn't either); a second
      // request while one is open settles the first as cancelled.
      resolver.current?.(false);
      resolver.current = resolve;
      setPending(opts);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);

  // Settle any in-flight request if the provider unmounts mid-dialog —
  // otherwise the awaiting call site hangs forever.
  useEffect(() => {
    return () => {
      resolver.current?.(false);
      resolver.current = null;
    };
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ModalShell
          open
          onClose={() => settle(false)}
          title={pending.title}
          dataTestId={pending.testId ?? "confirm-dialog"}
          footer={
            <ModalFooter>
              <PButton
                label={pending.cancelLabel ?? "cancel"}
                className="flex-1"
                onClick={() => settle(false)}
                data-testid="confirm-dialog-cancel"
              />
              <PButton
                danger={pending.danger !== false}
                primary={pending.danger === false}
                label={pending.confirmLabel}
                className="flex-1"
                onClick={() => settle(true)}
                data-testid="confirm-dialog-confirm"
              />
            </ModalFooter>
          }
        >
          <div className="font-body text-ui-sub text-dim">{pending.body}</div>
        </ModalShell>
      )}
    </ConfirmContext.Provider>
  );
}
