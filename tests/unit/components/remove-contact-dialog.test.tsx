import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { RemoveContactDialog } from "@/components/remove-contact-dialog";

describe("RemoveContactDialog", () => {
  test("confirm without conversation → onConfirm(false), no checkbox shown", () => {
    const onConfirm = vi.fn();
    render(
      <RemoveContactDialog
        contactName="Bob"
        hasConversation={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByTestId("remove-contact-delete-convo")).toBeNull();
    fireEvent.click(screen.getByTestId("remove-contact-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  test("checkbox unchecked by default → onConfirm(false)", () => {
    const onConfirm = vi.fn();
    render(
      <RemoveContactDialog
        contactName="Bob"
        hasConversation={true}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-contact-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  test("checked checkbox → onConfirm(true)", () => {
    const onConfirm = vi.fn();
    render(
      <RemoveContactDialog
        contactName="Bob"
        hasConversation={true}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-contact-delete-convo"));
    fireEvent.click(screen.getByTestId("remove-contact-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  test("cancel fires onCancel, not onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <RemoveContactDialog
        contactName="Bob"
        hasConversation={true}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-contact-cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
