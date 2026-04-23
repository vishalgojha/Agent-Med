import { Command } from "commander";
import { addPatient, getPatientById, listPatients } from "../patients/store.js";
import { runMigrations } from "../db/migrations.js";
import { splitCsv, print } from "../utils.js";

export function registerPatientCommands(program: Command): void {
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
}
