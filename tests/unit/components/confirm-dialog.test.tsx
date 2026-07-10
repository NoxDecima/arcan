import { describe, test, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "@/components/confirm-dialog";

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirmDialog = useConfirm();
  return (
    <button
      data-testid="trigger"
      onClick={() =>
        void confirmDialog({
          title: "delete thing",
          body: "the thing will be gone.",
          confirmLabel: "delete",
        }).then(onResult)
      }
    >
      go
    </button>
  );
}

describe("ConfirmProvider / useConfirm", () => {
  test("resolves true on confirm and closes", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(await screen.findByTestId("confirm-dialog")).toBeTruthy();
    expect(screen.getByText("the thing will be gone.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(results).toEqual([true]));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  test("resolves false on cancel", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(await screen.findByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(results).toEqual([false]));
  });

  test("resolves false on backdrop dismiss", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(await screen.findByTestId("modal-shell-backdrop"));
    await waitFor(() => expect(results).toEqual([false]));
  });

  test("unmount settles a pending confirm as false", async () => {
    const results: boolean[] = [];
    const { unmount } = render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    await screen.findByTestId("confirm-dialog");
    unmount();
    await waitFor(() => expect(results).toEqual([false]));
  });

  test("rendering useConfirm without a provider does not throw", () => {
    // Invoking would throw; merely rendering must be safe so existing
    // component tests don't need provider wrapping.
    render(<Harness onResult={() => {}} />);
    expect(screen.getByTestId("trigger")).toBeTruthy();
  });
});
