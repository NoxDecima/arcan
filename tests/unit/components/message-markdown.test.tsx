import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageMarkdown } from "@/components/message-markdown";

function md(source: string) {
  return render(<MessageMarkdown source={source} mine={false} />);
}

describe("MessageMarkdown rendering", () => {
  it("renders a heading, bold, and a list", () => {
    md("# Title\n\n**bold** text\n\n- one\n- two");
    expect(screen.getByText("Title").tagName).toMatch(/^H[1-6]$/);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
  it("renders a display-only task list with disabled checkboxes", () => {
    md("- [ ] todo\n- [x] done");
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0].disabled).toBe(true);
    expect(boxes[1].checked).toBe(true);
  });
  it("renders inline code and fenced code", () => {
    md("`inline`\n\n```\nblock\n```");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    expect(screen.getByText("block").closest("pre")).toBeTruthy();
  });
  it("renders a safe link with target+rel", () => {
    md("[site](https://example.com)");
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("renders plain text as a paragraph unchanged", () => {
    md("just plain text");
    expect(screen.getByText("just plain text").tagName).toBe("P");
  });
});

describe("MessageMarkdown security", () => {
  it("does NOT execute or render raw <script>", () => {
    const { container } = md("hi <script>window.__x=1</script> there");
    expect(container.querySelector("script")).toBeNull();
    expect((window as any).__x).toBeUndefined();
  });
  it("drops javascript: link hrefs", () => {
    md("[x](javascript:alert(1))");
    const a = screen.queryByRole("link") as HTMLAnchorElement | null;
    if (a) expect(a.getAttribute("href") || "").not.toMatch(/^javascript:/i);
  });
  it("does not render an <img onerror> injection", () => {
    const { container } = md('![x](x" onerror="window.__y=1)');
    const img = container.querySelector("img");
    if (img) expect(img.getAttribute("onerror")).toBeNull();
    expect((window as any).__y).toBeUndefined();
  });
});
