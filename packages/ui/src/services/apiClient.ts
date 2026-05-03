const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:3002';
const A2A_URL = process.env.NEXT_PUBLIC_A2A_URL || 'http://localhost:3100';
const CORE_URL = process.env.NEXT_PUBLIC_CORE_URL || 'http://localhost:3001';

export interface FhirConfig {
  serverUrl: string;
  accessToken: string;
  patientId?: string;
}

export interface McpToolCallResult {
  success: boolean;
  text: string;
}

export interface A2ATaskResult {
  id: string;
  status: string;
  text: string;
}

export interface HealthStatus {
  service: string;
  url: string;
  status: 'online' | 'offline' | 'error';
  details?: Record<string, unknown>;
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  fhirConfig: FhirConfig
): Promise<McpToolCallResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'x-fhir-server-url': fhirConfig.serverUrl,
  };
  if (fhirConfig.accessToken) {
    headers['x-fhir-access-token'] = fhirConfig.accessToken;
  }
  if (fhirConfig.patientId) {
    headers['x-patient-id'] = fhirConfig.patientId;
  }

  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
      id: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.error) {
    return { success: false, text: `Error: ${data.error.message ?? 'Unknown error'}` };
  }

  const content = data.result?.content as Array<{ type: string; text: string }> | undefined;
  const text = content?.find((c) => c.type === 'text')?.text ?? '';
  const isError = data.result?.isError ?? false;

  return { success: !isError, text };
}

export async function callA2AAgent(
  message: string,
  fhirConfig?: FhirConfig,
  sessionId?: string
): Promise<A2ATaskResult> {
  const body: Record<string, unknown> = {
    sessionId: sessionId ?? `ui_${Date.now()}`,
    message: {
      parts: [{ type: 'text', text: message }],
    },
  };

  if (fhirConfig) {
    body.metadata = {
      'https://sharponmcp.com/fhir-context': {
        fhirUrl: fhirConfig.serverUrl,
        fhirToken: fhirConfig.accessToken,
        patientId: fhirConfig.patientId,
      },
    };
  }

  const res = await fetch(`${A2A_URL}/tasks/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`A2A error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const parts = data.message?.parts as Array<{ type: string; text: string }> | undefined;
  const text = parts?.find((p) => p.type === 'text')?.text ?? 'No response';

  return {
    id: data.id,
    status: data.status ?? 'unknown',
    text,
  };
}

export async function checkHealths(): Promise<HealthStatus[]> {
  const services = [
    { name: 'Core API', url: CORE_URL },
    { name: 'MCP Server', url: MCP_URL },
    { name: 'A2A Agent', url: A2A_URL },
  ];

  const results = await Promise.allSettled(
    services.map(async (svc) => {
      const res = await fetch(`${svc.url}/health`, { signal: AbortSignal.timeout(5000) });
      const json = await res.json();
      return {
        service: svc.name,
        url: svc.url,
        status: res.ok ? ('online' as const) : ('error' as const),
        details: json,
      };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      service: services[i].name,
      url: services[i].url,
      status: 'offline' as const,
    };
  });
}

export async function listMcpTools(fhirConfig: FhirConfig): Promise<Array<{ name: string; description: string }>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'x-fhir-server-url': fhirConfig.serverUrl,
  };
  if (fhirConfig.accessToken) {
    headers['x-fhir-access-token'] = fhirConfig.accessToken;
  }
  if (fhirConfig.patientId) {
    headers['x-patient-id'] = fhirConfig.patientId;
  }

  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data.result?.tools ?? []).map((t: { name: string; description: string }) => ({
    name: t.name,
    description: t.description,
  }));
}

export async function getA2AAgentCard(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${A2A_URL}/.well-known/agent.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getMcpServerCard(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${MCP_URL}/.well-known/mcp-server.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export { MCP_URL, A2A_URL, CORE_URL };
