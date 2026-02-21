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
  status: "scheduled" | "sent" | "failed" | "dead_letter";
  retryCount?: number;
  lastError?: string;
  providerMessageId?: string;
  deadLetteredAt?: string;
  createdAt: string;
}

export interface FollowUpDeadLetterRecord {
  id: string;
  followUpId: string;
  patientId: string;
  doctorId: string;
  reason: string;
  lastError?: string;
  retryCount: number;
  payload: string;
  createdAt: string;
}
