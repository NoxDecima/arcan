import { describe, test, expect, beforeEach, vi } from "vitest";
import { LinearClient } from "../src/linear-client.js";

describe("LinearClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("createIssue posts the IssueCreate mutation with the right variables", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-id-1",
                identifier: "NOX-101",
                title: "Test feedback",
                url: "https://linear.app/nox/issue/NOX-101",
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    const result = await client.createIssue({
      title: "Test feedback",
      description: "Body of the issue",
      labelIds: ["feedback-label-uuid"],
    });

    expect(result.id).toBe("issue-id-1");
    expect(result.identifier).toBe("NOX-101");
    expect(result.url).toBe("https://linear.app/nox/issue/NOX-101");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.linear.app/graphql");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("lin_api_test");
    const body = JSON.parse(init?.body as string);
    expect(body.query).toContain("issueCreate");
    expect(body.variables.input).toMatchObject({
      teamId: "team-uuid",
      projectId: "project-uuid",
      title: "Test feedback",
      description: "Body of the issue",
      labelIds: ["feedback-label-uuid"],
    });
  });

  test("createIssue throws when the Linear API returns success=false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { issueCreate: { success: false, issue: null } },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.createIssue({ title: "x", description: "y", labelIds: [] })
    ).rejects.toThrow(/Linear issueCreate returned success=false/);
  });

  test("createIssue throws on HTTP error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 })
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.createIssue({ title: "x", description: "y", labelIds: [] })
    ).rejects.toThrow(/Linear API HTTP 429/);
  });
});

describe("LinearClient.uploadFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("uploadFile requests an upload URL, PUTs the bytes, returns the asset URL", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      // First call: GraphQL fileUpload mutation
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: "https://uploads.linear.app/signed-url",
                  assetUrl: "https://uploads.linear.app/asset/abc.png",
                  headers: [
                    { key: "x-amz-acl", value: "public-read" },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      // Second call: PUT to the signed URL
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await client.uploadFile({
      filename: "screenshot.png",
      contentType: "image/png",
      bytes,
    });

    expect(result.assetUrl).toBe("https://uploads.linear.app/asset/abc.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call: fileUpload mutation
    const [graphqlUrl, graphqlInit] = fetchMock.mock.calls[0]!;
    expect(graphqlUrl).toBe("https://api.linear.app/graphql");
    const graphqlBody = JSON.parse(graphqlInit?.body as string);
    expect(graphqlBody.query).toContain("fileUpload");
    expect(graphqlBody.variables).toMatchObject({
      filename: "screenshot.png",
      contentType: "image/png",
      size: 4,
    });

    // Second call: PUT to the signed URL
    const [putUrl, putInit] = fetchMock.mock.calls[1]!;
    expect(putUrl).toBe("https://uploads.linear.app/signed-url");
    expect(putInit?.method).toBe("PUT");
    expect((putInit?.headers as Record<string, string>)["x-amz-acl"]).toBe("public-read");
    expect(putInit?.body).toEqual(bytes);
  });

  test("uploadFile throws when the asset PUT fails", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: "https://uploads.linear.app/signed-url",
                  assetUrl: "https://uploads.linear.app/asset/abc.png",
                  headers: [],
                },
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("", { status: 500 }));

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.uploadFile({
        filename: "x.bin",
        contentType: "application/octet-stream",
        bytes: new Uint8Array([0]),
      })
    ).rejects.toThrow(/asset PUT failed: HTTP 500/);
  });
});
