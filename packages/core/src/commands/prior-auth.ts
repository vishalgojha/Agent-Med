import { Command } from "commander";
import { getPriorAuthById, listPriorAuths } from "../capabilities/prior-auth.js";
import { createIntent } from "../engine/intent.js";
import { executeIntent } from "../engine/executor.js";
import { createCapabilityHandlers, createRuntimeDeps } from "../runtime.js";
import { runMigrations } from "../db/migrations.js";
import { splitCsv, print, cliExecuteOptions } from "../utils.js";

export function registerPriorAuthCommands(program: Command): void {
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
}
