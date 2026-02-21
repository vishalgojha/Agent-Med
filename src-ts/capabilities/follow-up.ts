import PQueue from "p-queue";
import { AIClient } from "../ai/client.js";
import { loadPrompt } from "../ai/prompts.js";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { MessagingAdapter } from "../messaging/interface.js";
import {
  getFollowUpDeadLetterById,
  getFollowUpById,
  listDueFollowUps,
  listFailedFollowUps,
  markFollowUpSentWithProvider,
  markFollowUpFailedWithBackoff,
  markFollowUpSent,
  moveFollowUpToDeadLetter,
  requeueFollowUpFromDeadLetter,
  saveFollowUp,
  getPatientById
} from "../patients/store.js";
import { FollowUpMessage } from "../types.js";
import { nowIso } from "../utils.js";

export type FollowUpTrigger = "post_visit" | "lab_result" | "medication_reminder" | "custom";

const outboundQueue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 5 });
const MAX_RETRY_COUNT = 5;
const BACKOFF_MINUTES = [5, 15, 60, 240, 720];

export function getFollowUpQueueStats(): { queued: number; pending: number } {
  return {
    queued: outboundQueue.size,
    pending: outboundQueue.pending
  };
}

function getScheduledAt(trigger: FollowUpTrigger): string {
  const now = new Date();
  if (trigger === "post_visit") {
    now.setHours(now.getHours() + 24);
  }
  if (trigger === "medication_reminder") {
    now.setHours(now.getHours() + 24);
  }
  return now.toISOString();
}

function enforceHipaaSafeBody(input: string): string {
  let text = input;
  text = text.replace(/\b(hemoglobin|a1c|cancer|hiv|pregnan\w+|depress\w+)\b/gi, "health");
  text = text.replace(/\b\d{2,}\b/g, "");
  if (text.length > 280) {
    text = text.slice(0, 280);
  }
  return text.trim();
}

export async function runFollowUp(input: {
  patientId: string;
  doctorId: string;
  trigger: FollowUpTrigger;
  customMessage?: string;
  channel?: "sms" | "whatsapp";
  sendNow?: boolean;
  dryRun?: boolean;
  aiClient: AIClient;
  messaging: MessagingAdapter;
}): Promise<FollowUpMessage> {
  const patient = getPatientById(input.patientId);
  if (!patient) {
    throw new Error("Patient not found");
  }

  const channel = input.channel ?? "sms";
  const scheduledAt = input.sendNow ? nowIso() : getScheduledAt(input.trigger);
  const cfg = getConfig();

  const userPayload = JSON.stringify(
    {
      trigger: input.trigger,
      doctorId: input.doctorId,
      patientContext: {
        meds: patient.meds,
        allergies: patient.allergies
      },
      customMessage: input.customMessage ?? null
    },
    null,
    2
  );

  const schema = JSON.stringify(
    {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"]
    },
    null,
    2
  );

  const generated = await input.aiClient.completeStructured<{ body: string }>(
    loadPrompt("follow-up"),
    userPayload,
    schema
  );

  const fallbackBody =
    input.trigger === "lab_result"
      ? "Your results are ready. Please call our office."
      : "Please follow your care plan and call us with questions.";

  const body = enforceHipaaSafeBody(input.customMessage ?? generated.body ?? fallbackBody) || fallbackBody;

  const record = saveFollowUp({
    patientId: input.patientId,
    doctorId: input.doctorId,
    trigger: input.trigger,
    body,
    channel,
    scheduledAt
  });

  const dryRun = input.dryRun ?? cfg.dryRun;
  const message: FollowUpMessage = {
    to: patient.phone ?? "",
    body,
    scheduledAt,
    channel,
    status: "scheduled"
  };

  if (!message.to) {
    throw new Error("Patient phone number is required for follow-up");
  }

  if (dryRun) {
    logger.info("Dry-run follow-up", { to: message.to, body: message.body, channel: message.channel });
    return message;
  }

  const when = new Date(scheduledAt).getTime() - Date.now();
  if (when <= 0) {
    await outboundQueue.add(async () => {
      await input.messaging.send({ to: message.to, body: message.body, channel: message.channel });
      message.sentAt = nowIso();
      message.status = "sent";
      markFollowUpSent(record.id, "sent", message.sentAt);
    });
  } else {
    setTimeout(() => {
      void outboundQueue.add(async () => {
        try {
          const sendResult = await input.messaging.send({ to: message.to, body: message.body, channel: message.channel });
          const sentAt = nowIso();
          markFollowUpSentWithProvider(record.id, sentAt, sendResult.id);
        } catch {
          markFollowUpSent(record.id, "failed", nowIso());
        }
      });
    }, when);
  }

  return message;
}

export async function retryFailedFollowUp(input: {
  id: string;
  messaging: MessagingAdapter;
  dryRun?: boolean;
}): Promise<FollowUpMessage> {
  const record = getFollowUpById(input.id);
  if (!record) {
    throw new Error("Follow-up not found");
  }
  if (record.status !== "failed") {
    throw new Error("Only failed follow-ups can be retried");
  }

  const patient = getPatientById(record.patientId);
  if (!patient?.phone) {
    throw new Error("Patient phone number is required for retry");
  }

  const dryRun = input.dryRun ?? false;
  const message: FollowUpMessage = {
    to: patient.phone,
    body: record.body,
    scheduledAt: record.scheduledAt,
    channel: record.channel,
    status: "scheduled"
  };

  if (dryRun) {
    logger.info("Dry-run follow-up retry", { followUpId: record.id, to: message.to, channel: message.channel });
    return message;
  }

  try {
    const sendResult = await input.messaging.send({ to: message.to, body: message.body, channel: message.channel });
    message.sentAt = nowIso();
    message.status = "sent";
    markFollowUpSentWithProvider(record.id, message.sentAt, sendResult.id);
  } catch (error) {
    message.status = "failed";
    const retryCount = (record.retryCount ?? 0) + 1;
    if (retryCount > MAX_RETRY_COUNT) {
      moveFollowUpToDeadLetter({
        followUpId: record.id,
        reason: "max_retry_exceeded",
        lastError: error instanceof Error ? error.message : String(error),
        retryCount
      });
      message.status = "dead_letter";
    } else {
      const waitMinutes = BACKOFF_MINUTES[Math.min(retryCount - 1, BACKOFF_MINUTES.length - 1)];
      const nextAt = new Date(Date.now() + waitMinutes * 60 * 1000).toISOString();
      markFollowUpFailedWithBackoff(
        record.id,
        retryCount,
        error instanceof Error ? error.message : String(error),
        nextAt
      );
    }
  }

  return message;
}

export async function dispatchDueFollowUps(input: {
  messaging: MessagingAdapter;
  dryRun?: boolean;
  limit?: number;
}): Promise<{ attempted: number; sent: number; failed: number; dryRun: boolean }> {
  const cfg = getConfig();
  const dryRun = input.dryRun ?? cfg.dryRun;
  const due = listDueFollowUps(input.limit ?? 50);
  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const patient = getPatientById(row.patientId);
    if (!patient?.phone) {
      failed += 1;
      moveFollowUpToDeadLetter({
        followUpId: row.id,
        reason: "missing_phone",
        lastError: "Patient phone number is required",
        retryCount: row.retryCount ?? 0
      });
      continue;
    }

    if (dryRun) {
      logger.info("Dry-run due follow-up dispatch", {
        followUpId: row.id,
        to: patient.phone,
        channel: row.channel
      });
      continue;
    }

    try {
      const sendResult = await input.messaging.send({ to: patient.phone, body: row.body, channel: row.channel });
      sent += 1;
      markFollowUpSentWithProvider(row.id, nowIso(), sendResult.id);
    } catch (error) {
      failed += 1;
      const retryCount = (row.retryCount ?? 0) + 1;
      if (retryCount > MAX_RETRY_COUNT) {
        moveFollowUpToDeadLetter({
          followUpId: row.id,
          reason: "max_retry_exceeded",
          lastError: error instanceof Error ? error.message : String(error),
          retryCount
        });
      } else {
        const waitMinutes = BACKOFF_MINUTES[Math.min(retryCount - 1, BACKOFF_MINUTES.length - 1)];
        const nextAt = new Date(Date.now() + waitMinutes * 60 * 1000).toISOString();
        markFollowUpFailedWithBackoff(
          row.id,
          retryCount,
          error instanceof Error ? error.message : String(error),
          nextAt
        );
      }
    }
  }

  return { attempted: due.length, sent, failed, dryRun };
}

export async function retryFailedFollowUpsBulk(input: {
  messaging: MessagingAdapter;
  dryRun?: boolean;
  limit?: number;
}): Promise<{ attempted: number; sent: number; failed: number; skipped: number; dryRun: boolean }> {
  const cfg = getConfig();
  const dryRun = input.dryRun ?? cfg.dryRun;
  const failedRows = listFailedFollowUps(input.limit ?? 25);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of failedRows) {
    if ((row.retryCount ?? 0) >= MAX_RETRY_COUNT) {
      skipped += 1;
      continue;
    }
    const result = await retryFailedFollowUp({
      id: row.id,
      messaging: input.messaging,
      dryRun
    });
    if (result.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { attempted: failedRows.length, sent, failed, skipped, dryRun };
}

export async function requeueDeadLetterFollowUp(input: {
  deadLetterId: string;
  dryRun?: boolean;
}): Promise<FollowUpMessage> {
  const cfg = getConfig();
  const deadLetter = getFollowUpDeadLetterById(input.deadLetterId);
  if (!deadLetter) {
    throw new Error("Dead-letter record not found");
  }
  const patient = getPatientById(deadLetter.patientId);
  if (!patient?.phone) {
    throw new Error("Patient phone number is required for requeue");
  }

  const now = nowIso();
  const dryRun = input.dryRun ?? cfg.dryRun;
  if (dryRun) {
    logger.info("Dry-run dead-letter requeue", {
      deadLetterId: input.deadLetterId,
      followUpId: deadLetter.followUpId,
      patientId: deadLetter.patientId
    });
  } else {
    requeueFollowUpFromDeadLetter(input.deadLetterId, now);
  }

  const row = getFollowUpById(deadLetter.followUpId);
  const payload = row ? row : JSON.parse(deadLetter.payload) as { body: string; channel: "sms" | "whatsapp" };

  return {
    to: patient.phone,
    body: payload.body,
    channel: payload.channel,
    scheduledAt: now,
    status: "scheduled"
  };
}
