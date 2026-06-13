import type { Hono } from "hono";
import type { LinearClient } from "./linear-client.js";
import { InMemoryRateLimiter } from "./rate-limiter.js";

type Auth = {
  api: {
    getSession: (init: { headers: Headers }) => Promise<{
      user: { id: string; email: string };
    } | null>;
  };
};

export interface FeedbackRouteConfig {
  auth: Auth;
  linearClient: LinearClient;
  feedbackLabelId: string;
  categoryLabels: Record<"Bug" | "Idea" | "Question" | "Note", string>;
  maxTotalBytes: number;
  rateLimiterMax: number;
  rateLimiterWindowSeconds: number;
}

export function registerFeedbackRoute(
  app: Hono,
  config: FeedbackRouteConfig
): void {
  const rateLimiter = new InMemoryRateLimiter({
    max: config.rateLimiterMax,
    windowSeconds: config.rateLimiterWindowSeconds,
  });

  app.post("/api/feedback", async (c) => {
    // 1. Session
    const session = await config.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    // 2. Rate limit (per authenticated user)
    if (!rateLimiter.consume(session.user.id)) {
      return c.json({ error: "Rate limited" }, 429);
    }

    // 3. Parse the multipart body
    const form = await c.req.parseBody({ all: true });
    const messageRaw = form["message"];
    const message =
      typeof messageRaw === "string" ? messageRaw.trim() : "";
    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }
    const categoryRaw = form["category"];
    const category =
      typeof categoryRaw === "string" && categoryRaw in config.categoryLabels
        ? (categoryRaw as keyof typeof config.categoryLabels)
        : undefined;

    // 4. Build labels
    const labelIds = [config.feedbackLabelId];
    if (category) labelIds.push(config.categoryLabels[category]);

    // 4a. Attachments
    const attachmentEntries = form["attachment"];
    const attachmentFiles: File[] = Array.isArray(attachmentEntries)
      ? attachmentEntries.filter((e): e is File => e instanceof File)
      : attachmentEntries instanceof File
      ? [attachmentEntries]
      : [];

    const totalBytes = attachmentFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > config.maxTotalBytes) {
      return c.json(
        { error: `Combined attachment size exceeds ${config.maxTotalBytes} bytes` },
        413
      );
    }

    const uploaded: Array<{ filename: string; assetUrl: string }> = [];
    for (const file of attachmentFiles) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await config.linearClient.uploadFile({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        bytes,
      });
      uploaded.push({ filename: file.name, assetUrl: result.assetUrl });
    }

    // 5. Build description
    const attachmentLines =
      uploaded.length === 0
        ? []
        : ["", "Attachments:", ...uploaded.map((u) => `- [${u.filename}](${u.assetUrl})`)];

    const description = [
      message,
      "",
      "---",
      `Submitter: ${session.user.email}`,
      category ? `Category: ${category}` : null,
      ...attachmentLines,
    ]
      .filter((line) => line !== null)
      .join("\n");

    const title = message.split("\n")[0]!.slice(0, 60);

    const issue = await config.linearClient.createIssue({
      title: `[Feedback] ${title}`,
      description,
      labelIds,
    });

    return c.json({ ok: true, issue });
  });
}
