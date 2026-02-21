export interface Patient {
  id: string;
  doctorId: string;
  name: string;
  dob?: string;
  phone?: string;
  meds: string[];
  allergies: string[];
  createdAt: string;
}

export interface Visit {
  id: string;
  patientId: string;
  doctorId: string;
  at: string;
  summary?: string;
}

export interface FollowUpRecord {
  id: string;
  patientId: string;
  doctorId: string;
  trigger: string;
  body: string;
  channel: "sms" | "whatsapp";
  scheduledAt: string;
  sentAt?: string;
  status: "scheduled" | "sent" | "failed";
  retryCount?: number;
  lastError?: string;
  createdAt: string;
}
