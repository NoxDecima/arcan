import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skel, NavListSkeleton, ChatHeaderSkeleton, ChatMessagesSkeleton } from "@/components/skeleton";

describe("Skeleton primitives", () => {
  test("Skel renders an aria-hidden span with the requested size", () => {
    const { container } = render(<Skel w={120} h={20} r={6} />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("aria-hidden")).toBe("true");
    expect(span?.style.width).toBe("120px");
    expect(span?.style.height).toBe("20px");
  });
  test("NavListSkeleton renders the requested number of rows", () => {
    const { container } = render(<NavListSkeleton rows={4} />);
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(4 * 3);
  });
  test("ChatHeaderSkeleton + ChatMessagesSkeleton render without errors", () => {
    expect(() => render(<ChatHeaderSkeleton />)).not.toThrow();
    expect(() => render(<ChatMessagesSkeleton />)).not.toThrow();
  });
});
