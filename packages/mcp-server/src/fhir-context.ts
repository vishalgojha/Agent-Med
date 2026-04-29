export interface FhirContext {
  serverUrl: string;
  accessToken?: string;
  patientId?: string;
}

export const SHARP_HEADERS = {
  serverUrl: "x-fhir-server-url",
  accessToken: "x-fhir-access-token",
  patientId: "x-patient-id",
} as const;

export const SHARP_EXTENSION_URI = "https://sharponmcp.com/fhir-context";

export function extractFhirContext(headers: Record<string, string | undefined>): FhirContext | null {
  const serverUrl = headers[SHARP_HEADERS.serverUrl];
  if (!serverUrl) return null;

  return {
    serverUrl,
    accessToken: headers[SHARP_HEADERS.accessToken],
    patientId: headers[SHARP_HEADERS.patientId],
  };
}
