import { Command } from "commander";
import { addDoctor, getDoctorById, listDoctors } from "../doctors/store.js";
import { runMigrations } from "../db/migrations.js";
import { parseSpecialty, print } from "../utils.js";
import { runHealth } from "./health.js";

export function registerDoctorCommands(program: Command): void {
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
}
