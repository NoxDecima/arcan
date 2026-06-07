import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";

describe("setProfileAvatar", () => {
  it("writes a FileBlob to me.profile.avatar", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
    });
    const file = new File([new Uint8Array([1, 2, 3])], "me.png", { type: "image/png" });

    await setProfileAvatar(me as any, file);

    expect((me as any).profile.avatar).toBeDefined();
    expect((me as any).profile.avatar.mimeType).toBe("image/png");
    expect((me as any).profile.avatar.size).toBe(3);
  });

  it("replaces an existing avatar on second call", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
    });
    const first = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const second = new File([new Uint8Array([2, 2])], "b.png", { type: "image/png" });

    await setProfileAvatar(me as any, first);
    await setProfileAvatar(me as any, second);

    expect((me as any).profile.avatar.size).toBe(2);
    expect((me as any).profile.avatar.filename).toBe("b.png");
  });

  it("rejects oversized files via AttachmentTooLargeError", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
    });
    const oversized = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );

    await expect(setProfileAvatar(me as any, oversized)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });
});

describe("clearProfileAvatar", () => {
  it("removes me.profile.avatar so the field becomes undefined", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
    });
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    await setProfileAvatar(me as any, file);
    expect((me as any).profile.avatar).toBeDefined();

    await clearProfileAvatar(me as any);

    expect((me as any).profile.avatar).toBeUndefined();
  });
});
