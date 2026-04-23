import { Command } from "commander";
import { getReplayById, listReplay, pruneReplayOlderThan } from "../engine/replay.js";
import { runMigrations } from "../db/migrations.js";
import { print } from "../utils.js";

export function registerReplayCommands(program: Command): void {
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
}
