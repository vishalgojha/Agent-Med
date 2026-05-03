#!/usr/bin/env node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

async function main() {
  try {
    const mod = require("../dist/index.js");
    await mod.runCli(process.argv);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (e.message.includes("Cannot find module") || e.message.includes("ERR_MODULE_NOT_FOUND")) {
      console.error(
        JSON.stringify({
          ok: false,
          code: "CLI_NOT_BUILT",
          message: "CLI build artifacts are missing. Run 'npm run build' first."
        })
      );
      process.exit(1);
    }
    console.error(JSON.stringify({ ok: false, code: "CLI_FATAL", message: e.message }));
    process.exit(1);
  }
}

void main();
