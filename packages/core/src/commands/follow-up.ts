import { Command } from "commander";
import { createIntent } from "../engine/intent.js";
import { executeIntent } from "../engine/executor.js";
import { createCapabilityHandlers, createRuntimeDeps } from "../runtime.js";
import { runMigrations } from "../db/migrations.js";
import {
  listPendingDeliveries,
  getPendingDeliveryById,
  removePendingDeliveryById,
  removePendingDeliveriesByIds,
  inspectPendingDeliveriesByIds,
  listFailedDeliveries,
  getFailedDeliveryById,
  requeueFailedDelivery,
  retryFailedDeliveryNow
} from "../messaging/delivery-queue.js";
import { listFollowUps, listFollowUpDeadLetters } from "../patients/store.js";
import { listPriorAuths } from "../capabilities/prior-auth.js";
import { listPatients } from "../patients/store.js";
import { addPatient } from "../patients/store.js";
import { addDoctor } from "../doctors/store.js";
import { getDoctorById } from "../doctors/store.js";
import { listDoctors } from "../doctors/store.js";
import { getFollowUpQueueStats } from "../capabilities/follow-up.js";
import { runDecisionSupport } from "../capabilities/decision-support.js";
import { createAIClient } from "../ai/client.js";
import { print, splitCsv, cliExecuteOptions } from "../utils.js";

export function registerFollowUpCommands(program: Command): void {
  program
    .command("follow-up")
    .requiredOption("--patient-id <patientId>")
    .requiredOption("--doctor-id <doctorId>")
    .requiredOption("--trigger <trigger>")
    .option("--message <message>")
    .option("--channel <channel>", "sms|whatsapp", "sms")
    .option("--dry-run")
    .option("--send-now")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const risk = opts.sendNow ? "HIGH" : "MEDIUM";
      const intent = createIntent({
        capability: "follow_up",
        doctorId: opts.doctorId,
        patientId: opts.patientId,
        risk,
        dryRun: Boolean(opts.dryRun),
        payload: {
          patientId: opts.patientId,
          trigger: opts.trigger,
          customMessage: opts.message,
          channel: opts.channel,
          sendNow: Boolean(opts.sendNow)
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("follow-up-retry")
    .description("retry a failed follow-up send")
    .requiredOption("--id <id>")
    .option("--doctor-id <doctorId>", "audit doctor id", "d_cli")
    .option("--dry-run")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const intent = createIntent({
        capability: "follow_up",
        doctorId: opts.doctorId,
        risk: "HIGH",
        dryRun: Boolean(opts.dryRun),
        payload: {
          mode: "retry_failed",
          followUpId: opts.id
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("follow-up-dispatch")
    .description("dispatch due scheduled follow-ups")
    .option("--doctor-id <doctorId>", "audit doctor id", "d_cli")
    .option("--limit <limit>", "max due messages to process", "50")
    .option("--dry-run")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const limit = Number(opts.limit);
      const intent = createIntent({
        capability: "follow_up",
        doctorId: opts.doctorId,
        risk: "HIGH",
        dryRun: Boolean(opts.dryRun),
        payload: {
          mode: "dispatch_due",
          limit: Number.isFinite(limit) && limit > 0 ? limit : 50
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("follow-up-retry-bulk")
    .description("retry failed follow-ups in bulk with bounded retries/backoff")
    .option("--doctor-id <doctorId>", "audit doctor id", "d_cli")
    .option("--limit <limit>", "max failed messages to retry", "25")
    .option("--dry-run")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const limit = Number(opts.limit);
      const intent = createIntent({
        capability: "follow_up",
        doctorId: opts.doctorId,
        risk: "HIGH",
        dryRun: Boolean(opts.dryRun),
        payload: {
          mode: "retry_failed_bulk",
          limit: Number.isFinite(limit) && limit > 0 ? limit : 25
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("follow-up-list")
    .description("list follow-up jobs")
    .option("--patient-id <patientId>")
    .option("--status <status>", "scheduled|sent|failed|dead_letter")
    .action((opts) => {
      runMigrations();
      const status =
        opts.status === "scheduled" || opts.status === "sent" || opts.status === "failed" || opts.status === "dead_letter"
          ? opts.status
          : undefined;
      print({ ok: true, data: listFollowUps({ patientId: opts.patientId, status }) });
    });

  program
    .command("follow-up-dead-letter-list")
    .description("list dead-lettered follow-up jobs")
    .option("--limit <limit>", "default 50", "50")
    .action((opts) => {
      runMigrations();
      const limit = Number(opts.limit);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
      print({ ok: true, data: listFollowUpDeadLetters(safeLimit) });
    });

  program
    .command("follow-up-dead-letter-requeue")
    .description("requeue a dead-letter follow-up job")
    .requiredOption("--id <deadLetterId>")
    .option("--doctor-id <doctorId>", "audit doctor id", "d_cli")
    .option("--dry-run")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const intent = createIntent({
        capability: "follow_up",
        doctorId: opts.doctorId,
        risk: "MEDIUM",
        dryRun: Boolean(opts.dryRun),
        payload: {
          mode: "requeue_dead_letter",
          deadLetterId: opts.id
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions());
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("follow-up-queue-pending-list")
    .description("list pending durable follow-up delivery queue items")
    .option("--limit <limit>", "default 50", "50")
    .action(async (opts) => {
      runMigrations();
      const limit = Number(opts.limit);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
      const rows = await listPendingDeliveries(safeLimit);
      print({ ok: true, data: rows });
    });

  program
    .command("follow-up-queue-pending-show")
    .description("show a pending durable follow-up delivery queue item")
    .requiredOption("--id <queueId>")
    .action(async (opts) => {
      runMigrations();
      try {
        const row = await getPendingDeliveryById(String(opts.id));
        if (!row) {
          print({ ok: false, code: "NOT_FOUND", message: "Pending delivery not found" });
          return;
        }
        print({ ok: true, data: row });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });

  program
    .command("follow-up-queue-pending-cancel")
    .description("cancel and remove a pending durable follow-up delivery queue item")
    .requiredOption("--id <queueId>")
    .option("--confirm")
    .option("--dry-run")
    .action(async (opts) => {
      runMigrations();
      try {
        const queueId = String(opts.id);
        if (Boolean(opts.dryRun)) {
          const row = await getPendingDeliveryById(queueId);
          if (!row) {
            print({ ok: false, code: "NOT_FOUND", message: "Pending delivery not found" });
            return;
          }
          print({
            ok: true,
            data: {
              status: "dry_run",
              entry: row
            }
          });
          return;
        }
        if (!Boolean(opts.confirm)) {
          print({
            ok: false,
            code: "RISK_CONFIRMATION_REQUIRED",
            message: "Pending queue cancel requires --confirm"
          });
          return;
        }
        const row = await removePendingDeliveryById(queueId);
        print({
          ok: true,
          data: {
            status: "cancelled",
            entry: row
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "Pending delivery not found") {
          print({ ok: false, code: "NOT_FOUND", message });
          return;
        }
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });

  program
    .command("follow-up-queue-pending-cancel-bulk")
    .description("cancel and remove multiple pending durable follow-up delivery queue items")
    .requiredOption("--ids <queueIds>", "comma-separated queue IDs")
    .option("--confirm")
    .option("--dry-run")
    .action(async (opts) => {
      runMigrations();
      try {
        const queueIds = Array.from(new Set(splitCsv(String(opts.ids))));
        if (queueIds.length === 0) {
          print({ ok: false, code: "VALIDATION_ERROR", message: "--ids must be a non-empty comma-separated list" });
          return;
        }
        if (queueIds.length > 500) {
          print({ ok: false, code: "VALIDATION_ERROR", message: "--ids must contain at most 500 queue IDs" });
          return;
        }
        if (Boolean(opts.dryRun)) {
          const preview = await inspectPendingDeliveriesByIds(queueIds);
          print({
            ok: true,
            data: {
              status: "dry_run",
              attempted: queueIds.length,
              entries: preview.entries,
              missingIds: preview.missingIds
            }
          });
          return;
        }
        if (!Boolean(opts.confirm)) {
          print({
            ok: false,
            code: "RISK_CONFIRMATION_REQUIRED",
            message: "Pending queue bulk cancel requires --confirm"
          });
          return;
        }
        const cancelled = await removePendingDeliveriesByIds(queueIds);
        print({
          ok: true,
          data: {
            status: "cancelled",
            attempted: queueIds.length,
            cancelled: cancelled.cancelled,
            missingIds: cancelled.missingIds
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });

  program
    .command("follow-up-queue-failed-list")
    .description("list failed durable follow-up delivery queue items")
    .option("--limit <limit>", "default 50", "50")
    .action(async (opts) => {
      runMigrations();
      const limit = Number(opts.limit);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
      const rows = await listFailedDeliveries(safeLimit);
      print({ ok: true, data: rows });
    });

  program
    .command("follow-up-queue-failed-show")
    .description("show a failed durable follow-up delivery queue item")
    .requiredOption("--id <queueId>")
    .action(async (opts) => {
      runMigrations();
      try {
        const row = await getFailedDeliveryById(String(opts.id));
        if (!row) {
          print({ ok: false, code: "NOT_FOUND", message: "Failed delivery not found" });
          return;
        }
        print({ ok: true, data: row });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });

  program
    .command("follow-up-queue-failed-requeue")
    .description("move a failed durable queue item back to pending queue")
    .requiredOption("--id <queueId>")
    .option("--reset-retry-count")
    .action(async (opts) => {
      runMigrations();
      try {
        const row = await requeueFailedDelivery({
          queueId: String(opts.id),
          resetRetryCount: Boolean(opts.resetRetryCount)
        });
        print({ ok: true, data: row });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "Failed delivery not found") {
          print({ ok: false, code: "NOT_FOUND", message });
          return;
        }
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });

  program
    .command("follow-up-queue-failed-retry")
    .description("retry a failed durable queue item immediately")
    .requiredOption("--id <queueId>")
    .option("--confirm")
    .option("--dry-run")
    .action(async (opts) => {
      runMigrations();
      try {
        const queueId = String(opts.id);
        if (Boolean(opts.dryRun)) {
          const row = await getFailedDeliveryById(queueId);
          if (!row) {
            print({ ok: false, code: "NOT_FOUND", message: "Failed delivery not found" });
            return;
          }
          print({
            ok: true,
            data: {
              status: "dry_run",
              entry: row
            }
          });
          return;
        }
        if (!Boolean(opts.confirm)) {
          print({
            ok: false,
            code: "RISK_CONFIRMATION_REQUIRED",
            message: "Failed queue retry requires --confirm"
          });
          return;
        }
        const deps = createRuntimeDeps();
        const result = await retryFailedDeliveryNow({
          queueId,
          messaging: deps.messaging
        });
        print({ ok: true, data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "Failed delivery not found") {
          print({ ok: false, code: "NOT_FOUND", message });
          return;
        }
        if (message === "invalid delivery queue id") {
          print({ ok: false, code: "VALIDATION_ERROR", message });
          return;
        }
        throw error;
      }
    });
}
