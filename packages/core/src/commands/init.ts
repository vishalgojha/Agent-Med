import { Command } from "commander";
import { runMigrations } from "../db/migrations.js";
import { runHealth } from "./health.js";

export function registerInitCommands(program: Command): void {
  program
    .command("init")
    .description("create DB, run migrations, validate config")
    .action(async () => {
      runMigrations();
      await runHealth();
    });
}
