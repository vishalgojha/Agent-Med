import { Command } from "commander";
import { runDecisionSupport } from "../capabilities/decision-support.js";
import { createAIClient } from "../ai/client.js";
import { runMigrations } from "../db/migrations.js";
import { splitCsv, print } from "../utils.js";

export function registerDecideCommands(program: Command): void {
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
}
