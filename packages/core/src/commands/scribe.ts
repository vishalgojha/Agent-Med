import { Command } from "commander";
import { readFileSync } from "node:fs";
import { createAIClient } from "../ai/client.js";
import { runScribe } from "../capabilities/scribe.js";
import { runMigrations } from "../db/migrations.js";
import { print } from "../utils.js";

export function registerScribeCommands(program: Command): void {
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
}
