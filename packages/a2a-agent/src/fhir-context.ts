export interface FhirContextMetadata {
  fhirUrl: string;
  fhirToken?: string;
  patientId?: string;
}

export const SHARP_EXTENSION_URI = "https://sharponmcp.com/fhir-context";

export function extractFhirContextFromMessage(
  metadata?: Record<string, unknown>
): FhirContextMetadata | null {
  if (!metadata) return null;
  const sharp = metadata[SHARP_EXTENSION_URI] as Record<string, string> | undefined;
  if (!sharp?.fhirUrl) return null;

  return {
    fhirUrl: sharp.fhirUrl,
    fhirToken: sharp.fhirToken,
    patientId: sharp.patientId,
  };
}

export function toSharpHeaders(ctx: FhirContextMetadata): Record<string, string> {
  return {
    "x-fhir-server-url": ctx.fhirUrl,
    ...(ctx.fhirToken ? { "x-fhir-access-token": ctx.fhirToken } : {}),
    ...(ctx.patientId ? { "x-patient-id": ctx.patientId } : {}),
  };
}
