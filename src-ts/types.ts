export type Specialty =
  | "primary_care"
  | "emergency"
  | "oncology"
  | "psychiatry"
  | "hospitalist"
  | "surgery"
  | "general";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CapabilityName = "scribe" | "prior_auth" | "follow_up" | "decision_support";

export interface Intent {
  id: string;
  capability: CapabilityName;
  doctorId: string;
  patientId?: string;
  payload: Record<string, unknown>;
  risk: RiskLevel;
  dryRun: boolean;
  createdAt: string;
}

export interface ActionResult {
  ok: true;
  intentId: string;
  capability: CapabilityName;
  risk: RiskLevel;
  output: unknown;
  requestId?: string;
  actorId?: string;
  executedAt: string;
  durationMs: number;
}

export interface StructuredError {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
  blocked?: boolean;
  requiredConfirmation?: boolean;
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  generatedAt: string;
  transcriptHash: string;
}

export interface PriorAuthDraft {
  patientName: string;
  dob: string;
  insurerId: string;
  procedureCode: string;
  diagnosisCodes: string[];
  clinicalJustification: string;
  attachments: string[];
  status: "draft" | "submitted" | "approved" | "denied" | "pending";
}

export interface FollowUpMessage {
  to: string;
  body: string;
  scheduledAt: string;
  channel: "sms" | "whatsapp";
  sentAt?: string;
  status: "scheduled" | "sent" | "failed" | "dead_letter";
}

export interface ClinicalAlert {
  type: "drug_interaction" | "dosing" | "allergy" | "protocol_suggestion" | "disclaimer";
  severity?: "info" | "warn" | "critical";
  message: string;
  sources?: string[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
