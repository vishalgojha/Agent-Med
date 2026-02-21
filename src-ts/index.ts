import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAIClient } from "./ai/client.js";
import { runDecisionSupport } from "./capabilities/decision-support.js";
import { getPriorAuthById, listPriorAuths } from "./capabilities/prior-auth.js";
import { runScribe } from "./capabilities/scribe.js";
import { getConfig } from "./config.js";
import { closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrations.js";
import { addDoctor, getDoctorById, listDoctors } from "./doctors/store.js";
import { createIntent } from "./engine/intent.js";
import { executeIntent } from "./engine/executor.js";
import { getReplayById, listReplay, pruneReplayOlderThan } from "./engine/replay.js";
import { createCapabilityHandlers, createRuntimeDeps } from "./runtime.js";
import { startServer } from "./server.js";
import { addPatient, getPatientById, listFollowUps, listPatients } from "./patients/store.js";
import { Specialty } from "./types.js";
import { getOpsMetrics } from "./ops/metrics.js";
import { getFollowUpQueueStats } from "./capabilities/follow-up.js";

function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function splitCsv(value?: string): string[] {
  if (!value) return [];
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

function cliExecuteOptions(confirm?: boolean, actorId = "cli"): { confirm: boolean; requestId: string; actorId: string } {
  return {
    confirm: Boolean(confirm),
    requestId: `cli-${randomUUID()}`,
    actorId
  };
}

function parseSpecialty(value: string): Specialty {
  const allowed: Specialty[] = [
    "primary_care",
    "emergency",
    "oncology",
    "psychiatry",
    "hospitalist",
    "surgery",
    "general"
  ];
  if (!allowed.includes(value as Specialty)) {
    throw new Error(`Invalid specialty '${value}'. Allowed: ${allowed.join(", ")}`);
  }
  return value as Specialty;
}

async function runHealth(): Promise<void> {
  const cfg = getConfig();
  runMigrations();

  const checks = {
    db: "ok",
    aiConfigured: Boolean(cfg.anthropicApiKey),
    twilioConfigured: Boolean(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFromNumber),
    dryRun: cfg.dryRun
  };

  print({ ok: true, data: checks });
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program.name("doctor").description("doctor-agent CLI").version("0.1.0");

  program
    .command("init")
    .description("create DB, run migrations, validate config")
    .action(async () => {
      runMigrations();
      await runHealth();
    });

  program.command("health").description("health check").action(async () => {
    await runHealth();
  });

  program
    .command("doctor")
    .description("doctor profile management and diagnostics")
    .addCommand(
      new Command("health").action(async () => {
        await runHealth();
      })
    )
    .addCommand(
      new Command("add")
        .description("create doctor profile")
        .requiredOption("--name <name>")
        .option("--specialty <specialty>", "doctor specialty", "general")
        .action((opts) => {
          runMigrations();
          const doctor = addDoctor({
            name: opts.name,
            specialty: parseSpecialty(opts.specialty)
          });
          print({ ok: true, data: doctor });
        })
    )
    .addCommand(
      new Command("list").action(() => {
        runMigrations();
        print({ ok: true, data: listDoctors() });
      })
    )
    .addCommand(
      new Command("show")
        .requiredOption("--id <id>")
        .action((opts) => {
          runMigrations();
          const doctor = getDoctorById(opts.id);
          print(doctor ? { ok: true, data: doctor } : { ok: false, code: "NOT_FOUND", message: "Doctor not found" });
        })
    );

  program
    .command("patient")
    .description("patient management")
    .addCommand(
      new Command("add")
        .requiredOption("--name <name>")
        .requiredOption("--doctor-id <doctorId>")
        .option("--dob <dob>")
        .option("--phone <phone>")
        .option("--meds <list>")
        .option("--allergies <list>")
        .action((opts) => {
          runMigrations();
          const patient = addPatient({
            name: opts.name,
            doctorId: opts.doctorId,
            dob: opts.dob,
            phone: opts.phone,
            meds: splitCsv(opts.meds),
            allergies: splitCsv(opts.allergies)
          });
          print({ ok: true, data: patient });
        })
    )
    .addCommand(
      new Command("list").action(() => {
        runMigrations();
        print({ ok: true, data: listPatients() });
      })
    )
    .addCommand(
      new Command("show")
        .requiredOption("--id <id>")
        .action((opts) => {
          runMigrations();
          const patient = getPatientById(opts.id);
          print(patient ? { ok: true, data: patient } : { ok: false, code: "NOT_FOUND", message: "Patient not found" });
        })
    );

  program
    .command("scribe")
    .requiredOption("--patient-id <patientId>")
    .requiredOption("--doctor-id <doctorId>")
    .option("--transcript <transcript>")
    .option("--file <path>")
    .action(async (opts) => {
      runMigrations();
      const aiClient = createAIClient();
      const transcript = opts.transcript ?? (opts.file ? readFileSync(opts.file, "utf8") : "");
      const output = await runScribe({
        transcript,
        patientId: opts.patientId,
        doctorId: opts.doctorId,
        aiClient
      });
      print({ ok: true, data: output });
    });

  program
    .command("prior-auth")
    .requiredOption("--patient-id <patientId>")
    .requiredOption("--doctor-id <doctorId>")
    .requiredOption("--procedure <procedureCode>")
    .requiredOption("--insurer <insurerId>")
    .option("--diagnosis <codes>")
    .option("--submit")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const intent = createIntent({
        capability: "prior_auth",
        doctorId: opts.doctorId,
        patientId: opts.patientId,
        risk: opts.submit ? "HIGH" : "MEDIUM",
        dryRun: false,
        payload: {
          patientId: opts.patientId,
          procedureCode: opts.procedure,
          diagnosisCodes: splitCsv(opts.diagnosis),
          insurerId: opts.insurer,
          submit: Boolean(opts.submit)
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

  program
    .command("prior-auth-list")
    .description("list prior auth drafts")
    .option("--patient-id <patientId>")
    .action((opts) => {
      runMigrations();
      print({ ok: true, data: listPriorAuths(opts.patientId) });
    });

  program
    .command("prior-auth-show")
    .description("show prior auth by id")
    .requiredOption("--id <id>")
    .action((opts) => {
      runMigrations();
      const row = getPriorAuthById(opts.id);
      print(row ? { ok: true, data: row } : { ok: false, code: "NOT_FOUND", message: "Prior auth not found" });
    });

  program
    .command("prior-auth-status")
    .description("update prior auth status")
    .requiredOption("--id <id>")
    .requiredOption("--status <status>", "draft|submitted|approved|denied|pending")
    .option("--doctor-id <doctorId>", "audit doctor id", "d_cli")
    .option("--confirm")
    .action(async (opts) => {
      runMigrations();
      const deps = createRuntimeDeps();
      const intent = createIntent({
        capability: "prior_auth",
        doctorId: opts.doctorId,
        risk: "HIGH",
        dryRun: false,
        payload: {
          mode: "status_update",
          priorAuthId: opts.id,
          status: opts.status
        }
      });
      const result = await executeIntent(intent, createCapabilityHandlers(deps), cliExecuteOptions(opts.confirm));
      print(result.ok === false ? result : { ok: true, data: result.output });
    });

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
    .command("decide")
    .option("--patient-id <patientId>")
    .option("--doctor-id <doctorId>", "doctor context", "d_cli")
    .option("--meds <meds>")
    .option("--allergies <allergies>")
    .option("--age <age>")
    .option("--weight <weight>")
    .requiredOption("--query <query>")
    .action(async (opts) => {
      runMigrations();
      const aiClient = createAIClient();
      const output = await runDecisionSupport({
        aiClient,
        patientId: opts.patientId,
        meds: splitCsv(opts.meds),
        allergies: splitCsv(opts.allergies),
        age: opts.age ? Number(opts.age) : undefined,
        weight: opts.weight ? Number(opts.weight) : undefined,
        query: opts.query
      });
      print({ ok: true, data: output });
    });

  program
    .command("replay")
    .description("audit replay log")
    .addCommand(
      new Command("list")
        .option("--limit <limit>", "default 20", "20")
        .action((opts) => {
          runMigrations();
          print({ ok: true, data: listReplay(Number(opts.limit)) });
        })
    )
    .addCommand(
      new Command("show")
        .requiredOption("--id <id>")
        .action((opts) => {
          runMigrations();
          const row = getReplayById(opts.id);
          print(row ? { ok: true, data: row } : { ok: false, code: "NOT_FOUND", message: "Replay item not found" });
        })
    )
    .addCommand(
      new Command("prune")
        .description("delete replay rows older than N days")
        .option("--days <days>", "default 30", "30")
        .option("--confirm")
        .action((opts) => {
          runMigrations();
          const days = Number(opts.days);
          if (!Number.isFinite(days) || days <= 0) {
            print({ ok: false, code: "VALIDATION_ERROR", message: "days must be positive" });
            return;
          }
          if (!opts.confirm) {
            print({
              ok: false,
              code: "RISK_CONFIRMATION_REQUIRED",
              message: "Replay pruning requires --confirm",
              requiredConfirmation: true
            });
            return;
          }
          const deleted = pruneReplayOlderThan(days);
          print({ ok: true, data: { deleted, days } });
        })
    );

  program
    .command("follow-up-list")
    .description("list follow-up jobs")
    .option("--patient-id <patientId>")
    .option("--status <status>", "scheduled|sent|failed")
    .action((opts) => {
      runMigrations();
      const status =
        opts.status === "scheduled" || opts.status === "sent" || opts.status === "failed" ? opts.status : undefined;
      print({ ok: true, data: listFollowUps({ patientId: opts.patientId, status }) });
    });

  program
    .command("ops-metrics")
    .description("show operational metrics snapshot")
    .action(() => {
      runMigrations();
      print({
        ok: true,
        data: {
          ...getOpsMetrics(),
          queue: getFollowUpQueueStats()
        }
      });
    });

  program
    .command("serve")
    .description("start express API")
    .action(() => {
      startServer();
    });

  program
    .command("seed")
    .description("create demo doctor and patient for quick trial")
    .option("--specialty <specialty>", "doctor specialty", "primary_care")
    .option("--doctor-name <name>", "doctor display name", "Dr. Demo")
    .option("--patient-name <name>", "patient display name", "Patient Demo")
    .option("--phone <phone>", "patient phone in E.164", "+15550000000")
    .action((opts) => {
      runMigrations();
      const doctor = addDoctor({
        name: opts.doctorName,
        specialty: parseSpecialty(opts.specialty)
      });
      const patient = addPatient({
        doctorId: doctor.id,
        name: opts.patientName,
        phone: opts.phone,
        meds: ["lisinopril"],
        allergies: ["penicillin"]
      });
      print({
        ok: true,
        data: {
          doctor,
          patient,
          next: [
            `npm run start -- scribe --transcript "Patient reports cough for 3 days" --patient-id ${patient.id} --doctor-id ${doctor.id}`,
            `npm run start -- prior-auth --patient-id ${patient.id} --doctor-id ${doctor.id} --procedure 99213 --diagnosis Z00.00 --insurer BCBS`,
            `npm run start -- follow-up --patient-id ${patient.id} --doctor-id ${doctor.id} --trigger lab_result --dry-run`,
            `npm run start -- decide --patient-id ${patient.id} --query "Is it safe to add metformin?"`
          ]
        }
      });
    });

  program
    .command("doctor-add")
    .description("deprecated alias for 'doctor add'")
    .requiredOption("--name <name>")
    .option("--specialty <specialty>", "doctor specialty", "general")
    .action((opts) => {
      runMigrations();
      const doctor = addDoctor({
        name: opts.name,
        specialty: parseSpecialty(opts.specialty)
      });
      print({
        ok: true,
        data: doctor,
        meta: { warning: "doctor-add is deprecated; use 'doctor add'." }
      });
    });

  await program.parseAsync(argv);
  closeDb();
}

runCli().catch((error) => {
  print({ ok: false, code: "CLI_ERROR", message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
