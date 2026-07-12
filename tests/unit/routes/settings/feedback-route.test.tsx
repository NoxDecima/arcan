// FeedbackRoute — FormData contract with the api (restores the one unique
// assertion lost when the legacy feedback-section test was deleted in
// Phase 4: the CATEGORIES tuple Title-casing and the no-category shape).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { FeedbackRoute } from "@/routes/settings/feedback-route";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_ztest" },
    profile: { displayName: "tester" },
  }),
}));

// pickFilesNative returns null on web — openPicker falls through to inputRef.click()
vi.mock("@/platform/files", () => ({
  pickFilesNative: vi.fn(async () => null),
}));

function renderRoute() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/settings/feedback"]}>
        <FeedbackRoute />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("FeedbackRoute dropzone click-loop regression", () => {
  it("one click on the dropzone triggers the file input click exactly once", async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/settings/feedback"]}>
          <FeedbackRoute />
        </MemoryRouter>
      </ToastProvider>,
    );

    const input = screen.getByTestId("feedback-file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    // Click the dropzone container (the role=button div)
    fireEvent.click(screen.getByRole("button", { name: /add a screenshot/i }));

    // Give the async openPicker microtask time to drain
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());

    // The critical assertion: must be exactly 1 — not 21 from the loop
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe("FeedbackRoute FormData contract", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // fresh spy per test — spyOn on the same object accumulates calls
    vi.restoreAllMocks();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }) as any);
  });

  it("omits category when none selected", async () => {
    const { getByTestId } = renderRoute();
    fireEvent.change(getByTestId("feedback-message"), {
      target: { value: "hello there" },
    });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(body.get("category")).toBeNull();
    expect(body.get("message")).toBe("hello there");
  });

  it("sends the Title-cased category label", async () => {
    const { getByTestId } = renderRoute();
    fireEvent.click(getByTestId("feedback-category-bug"));
    fireEvent.change(getByTestId("feedback-message"), {
      target: { value: "something broke" },
    });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(body.get("category")).toBe("Bug");
  });
});
