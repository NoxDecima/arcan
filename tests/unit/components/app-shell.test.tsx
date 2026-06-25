import { test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/app-shell";

// Sidebar pulls account state; stub it to a marker.
vi.mock("@/components/sidebar", () => ({ Sidebar: () => <div data-testid="sidebar" /> }));

test("AppShell renders the sidebar + outlet content", () => {
  const { getByTestId, getByText } = render(
    <MemoryRouter initialEntries={["/x"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/x" element={<div>child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(getByTestId("sidebar")).toBeTruthy();
  expect(getByText("child")).toBeTruthy();
});
