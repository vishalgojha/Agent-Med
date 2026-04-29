import { CallToolResult, RequestInfo, IsomorphicHeaders } from "@modelcontextprotocol/sdk/types.js";
import { FhirContext, extractFhirContext } from "../fhir-context";

export function getHeaders(extra: { requestInfo?: RequestInfo }): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  const rawHeaders = extra.requestInfo?.headers as IsomorphicHeaders | undefined;
  if (rawHeaders) {
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value[0];
      }
    }
  }
  return headers;
}

export function getFhirCtx(extra: { requestInfo?: RequestInfo }): FhirContext | null {
  return extractFhirContext(getHeaders(extra));
}

export function ok(text: string): CallToolResult {
  return { content: [{ type: "text" as const, text }] };
}

export function err(text: string): CallToolResult {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true };
}
