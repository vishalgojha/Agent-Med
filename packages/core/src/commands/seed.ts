import { Command } from "commander";
import { addDoctor } from "../doctors/store.js";
import { addPatient as addPatientStore } from "../patients/store.js";
import { parseSpecialty, print } from "../utils.js";
import { runMigrations } from "../db/migrations.js";

export function registerSeedCommands(program: Command): void {
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
      const patient = addPatientStore({
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
}
