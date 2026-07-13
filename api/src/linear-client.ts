const GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

export interface LinearClientConfig {
  apiToken: string;
  teamId: string;
  projectId: string;
}

export interface CreateIssueInput {
  title: string;
  description: string;
  labelIds: string[];
}

export interface CreatedIssue {
  id: string;
  identifier: string;
  url: string;
}

export interface UploadFileInput {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface UploadedFile {
  assetUrl: string;
}

export class LinearClient {
  private readonly config: LinearClientConfig;

  constructor(config: LinearClientConfig) {
    this.config = config;
  }

  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const query = `
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }
    `;
    const variables = {
      input: {
        teamId: this.config.teamId,
        projectId: this.config.projectId,
        title: input.title,
        description: input.description,
        labelIds: input.labelIds,
      },
    };

    const res = await this.gql<{
      issueCreate: { success: boolean; issue: CreatedIssue | null };
    }>(query, variables);

    if (!res.issueCreate.success || !res.issueCreate.issue) {
      throw new Error(`Linear issueCreate returned success=false`);
    }
    return res.issueCreate.issue;
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFile> {
    const query = `
      mutation FileUpload($filename: String!, $contentType: String!, $size: Int!) {
        fileUpload(filename: $filename, contentType: $contentType, size: $size) {
          success
          uploadFile {
            uploadUrl
            assetUrl
            headers { key value }
          }
        }
      }
    `;
    const variables = {
      filename: input.filename,
      contentType: input.contentType,
      size: input.bytes.byteLength,
    };

    const data = await this.gql<{
      fileUpload: {
        success: boolean;
        uploadFile: {
          uploadUrl: string;
          assetUrl: string;
          headers: Array<{ key: string; value: string }>;
        } | null;
      };
    }>(query, variables);

    if (!data.fileUpload.success || !data.fileUpload.uploadFile) {
      throw new Error("Linear fileUpload returned success=false");
    }

    const { uploadUrl, assetUrl, headers } = data.fileUpload.uploadFile;
    const putHeaders: Record<string, string> = {};
    for (const h of headers) putHeaders[h.key] = h.value;

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: putHeaders,
      body: input.bytes,
    });
    if (!putRes.ok) {
      throw new Error(`Linear asset PUT failed: HTTP ${putRes.status}`);
    }

    return { assetUrl };
  }

  private async gql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": this.config.apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(`Linear API HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      throw new Error(`Linear API GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    if (!json.data) throw new Error("Linear API returned no data");
    return json.data;
  }
}
