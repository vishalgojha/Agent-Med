import { FhirContext } from "./fhir-context";

export interface FhirBundle {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: Array<{
    resource?: Record<string, unknown>;
    fullUrl?: string;
  }>;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export class FhirClient {
  constructor(private ctx: FhirContext) {}

  async read(resourceType: string, id: string): Promise<FhirResource | null> {
    const url = `${this.normalizeBaseUrl()}/${resourceType}/${id}`;
    return this.fetchResource(url);
  }

  async search(
    resourceType: string,
    params: Record<string, string> = {}
  ): Promise<FhirBundle> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.normalizeBaseUrl()}/${resourceType}${query ? `?${query}` : ""}`;
    return this.fetchResource<FhirBundle>(url);
  }

  async searchByPatient(
    resourceType: string,
    additionalParams: Record<string, string> = {}
  ): Promise<FhirBundle> {
    if (!this.ctx.patientId) {
      throw new Error("Patient ID is required for patient-scoped searches");
    }
    return this.search(resourceType, {
      patient: this.ctx.patientId,
      ...additionalParams,
    });
  }

  async getPatientSummary(): Promise<{
    patient: FhirResource | null;
    conditions: FhirBundle;
    medications: FhirBundle;
    observations: FhirBundle;
    encounters: FhirBundle;
  }> {
    const [patient, conditions, medications, observations, encounters] = await Promise.all([
      this.ctx.patientId ? this.read("Patient", this.ctx.patientId) : null,
      this.searchByPatient("Condition"),
      this.searchByPatient("MedicationRequest"),
      this.searchByPatient("Observation", { category: "vital-signs" }),
      this.searchByPatient("Encounter", { status: "finished" }),
    ]);

    return { patient, conditions, medications, observations, encounters };
  }

  private normalizeBaseUrl(): string {
    let url = this.ctx.serverUrl;
    if (url.endsWith("/")) url = url.slice(0, -1);
    return url;
  }

  private async fetchResource<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/fhir+json, application/json",
    };
    if (this.ctx.accessToken) {
      headers.Authorization = `Bearer ${this.ctx.accessToken}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) return null as unknown as T;
      throw new Error(`FHIR API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }
}
