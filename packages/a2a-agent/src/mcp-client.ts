export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

interface McpTool {
  name: string;
  description: string;
}

interface McpResponse {
  jsonrpc?: string;
  result?: {
    tools?: McpTool[];
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

export class McpClient {
  constructor(private baseUrl: string, private authToken?: string) {}

  async listTools(): Promise<McpTool[]> {
    const res = await this.post({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: 1,
    });
    return (res.result?.tools ?? []) as McpTool[];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<ToolResult> {
    const body = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name, arguments: args, _meta: headers },
      id: 2,
    };

    const res = await this.post(body);

    if (res.error) {
      return { success: false, content: "", error: res.error.message ?? "Unknown error" };
    }

    const content = res.result?.content;
    const text = content?.find((c) => c.type === "text")?.text ?? "";
    const isError = res.result?.isError ?? false;

    return { success: !isError, content: text, error: isError ? text : undefined };
  }

  private async post(body: unknown): Promise<McpResponse> {
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<McpResponse>;
  }
}
