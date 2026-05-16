import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No conversations yet" description="Some desc" />);
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<EmptyState title="Title" description="Send an invite link to a friend." />);
    expect(
      screen.getByText("Send an invite link to a friend."),
    ).toBeInTheDocument();
  });

  it("renders both title and description when provided together", () => {
    render(
      <EmptyState
        title="No conversations yet"
        description="Send an invite link to a friend to start your first conversation."
      />,
    );
    expect(screen.getByRole("heading", { name: "No conversations yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Send an invite link to a friend to start your first conversation.",
      ),
    ).toBeInTheDocument();
  });
});
