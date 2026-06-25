import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { FeedbackRoute } from "@/routes/settings/feedback-route";
import type { ReactNode } from "react";

// Unit 9-5b moved the inline feedback form to the dedicated /settings/feedback
// route (FeedbackRoute). The submission logic (multipart POST, Title-case
// category, submit-disabled-until-non-empty) is preserved verbatim, so this
// suite now drives FeedbackRoute. It uses useNavigate, hence the router wrap.
function Wrap({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

describe("FeedbackRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("submits text-only feedback with no category", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, issue: { identifier: "NOX-99", url: "x" } }), { status: 200 })
    );
    const { getByTestId } = render(
      <Wrap>
        <FeedbackRoute />
      </Wrap>
    );
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "hello" } });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    const formData = init?.body as FormData;
    expect(formData.get("message")).toBe("hello");
    expect(formData.get("category")).toBeNull();
  });

  test("clicking a category chip sends the Title-case label", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, issue: { identifier: "NOX-99", url: "x" } }), { status: 200 })
    );
    const { getByTestId } = render(
      <Wrap>
        <FeedbackRoute />
      </Wrap>
    );
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "test bug" } });
    fireEvent.click(getByTestId("feedback-category-bug"));
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const formData = (fetchMock.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(formData.get("category")).toBe("Bug");
  });

  test("submit disabled until message is non-empty", () => {
    const { getByTestId } = render(
      <Wrap>
        <FeedbackRoute />
      </Wrap>
    );
    const btn = getByTestId("feedback-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(getByTestId("feedback-message"), { target: { value: "x" } });
    expect(btn.disabled).toBe(false);
  });
});
