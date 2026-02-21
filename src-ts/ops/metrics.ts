import { getDb } from "../db/client.js";

function scalar(query: string, ...params: unknown[]): number {
  const db = getDb();
  const row = db.prepare(query).get(...params) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export interface OpsMetrics {
  doctors: number;
  patients: number;
  notes: number;
  priorAuth: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    denied: number;
    pending: number;
  };
  followUps: {
    total: number;
    scheduled: number;
    sent: number;
    failed: number;
    deadLetter: number;
    delivered: number;
    undelivered: number;
    due: number;
  };
  deadLetters: {
    total: number;
  };
  replay: {
    total: number;
  };
}

export function getOpsMetrics(): OpsMetrics {
  const now = new Date().toISOString();
  return {
    doctors: scalar("SELECT COUNT(*) AS count FROM doctors"),
    patients: scalar("SELECT COUNT(*) AS count FROM patients"),
    notes: scalar("SELECT COUNT(*) AS count FROM notes"),
    priorAuth: {
      total: scalar("SELECT COUNT(*) AS count FROM prior_auths"),
      draft: scalar("SELECT COUNT(*) AS count FROM prior_auths WHERE status = 'draft'"),
      submitted: scalar("SELECT COUNT(*) AS count FROM prior_auths WHERE status = 'submitted'"),
      approved: scalar("SELECT COUNT(*) AS count FROM prior_auths WHERE status = 'approved'"),
      denied: scalar("SELECT COUNT(*) AS count FROM prior_auths WHERE status = 'denied'"),
      pending: scalar("SELECT COUNT(*) AS count FROM prior_auths WHERE status = 'pending'")
    },
    followUps: {
      total: scalar("SELECT COUNT(*) AS count FROM follow_ups"),
      scheduled: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE status = 'scheduled'"),
      sent: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE status = 'sent'"),
      failed: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE status = 'failed'"),
      deadLetter: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE status = 'dead_letter'"),
      delivered: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE delivery_status = 'delivered'"),
      undelivered: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE delivery_status IN ('undelivered', 'failed')"),
      due: scalar("SELECT COUNT(*) AS count FROM follow_ups WHERE status = 'scheduled' AND scheduled_at <= ?", now)
    },
    deadLetters: {
      total: scalar("SELECT COUNT(*) AS count FROM follow_up_dead_letters")
    },
    replay: {
      total: scalar("SELECT COUNT(*) AS count FROM replay_log")
    }
  };
}
