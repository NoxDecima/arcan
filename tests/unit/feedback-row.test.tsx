import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { FeedbackRow } from "@/routes/settings/feedback-section";

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/settings" element={<FeedbackRow />} />
        <Route path="/settings/feedback" element={<div>FEEDBACK PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FeedbackRow", () => {
  it("renders the collapsed row copy", () => {
    renderAt("/settings");
    expect(screen.getByText("give feedback")).toBeInTheDocument();
    expect(screen.getByText("report a bug or share an idea")).toBeInTheDocument();
  });

  it("navigates to /settings/feedback on click", async () => {
    const user = userEvent.setup();
    renderAt("/settings");
    await user.click(screen.getByTestId("feedback-row"));
    expect(screen.getByText("FEEDBACK PAGE")).toBeInTheDocument();
  });
});
