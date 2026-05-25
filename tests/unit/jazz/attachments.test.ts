import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { Group } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";

describe("uploadAttachment", () => {
  it("creates a FileBlob with the right mimeType/size/filename and a loaded FileStream", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const file = new File([bytes], "hello.bin", { type: "application/octet-stream" });

    const blob = await uploadAttachment(group, file);

    expect((blob as any).mimeType).toBe("application/octet-stream");
    expect((blob as any).size).toBe(5);
    expect((blob as any).filename).toBe("hello.bin");
    expect((blob as any).data).toBeDefined();
  });

  it("rejects files larger than MAX_ATTACHMENT_BYTES", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });

    const oversized = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const file = new File([oversized], "big.bin", { type: "application/octet-stream" });

    await expect(uploadAttachment(group, file)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });

  it("MAX_ATTACHMENT_BYTES is exactly 5_000_000 (5 MB)", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5_000_000);
  });
});
