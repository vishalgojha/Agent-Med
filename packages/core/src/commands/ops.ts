import { Command } from "commander";
import { getOpsMetrics } from "../ops/metrics.js";
import { getFollowUpQueueStats } from "../capabilities/follow-up.js";
import { runMigrations } from "../db/migrations.js";
import { print } from "../utils.js";

export function registerOpsCommands(program: Command): void {
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
}
