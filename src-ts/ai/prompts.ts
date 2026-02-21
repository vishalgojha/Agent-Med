import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const promptCache = new Map<string, string>();

export function loadPrompt(name: "scribe" | "prior-auth" | "follow-up" | "decision"): string {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, "prompts", `${name}.txt`);
  const text = fs.readFileSync(file, "utf8");
  promptCache.set(name, text);
  return text;
}
