import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";
import { extractJson } from "./parser.js";

export interface AIClient {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
  completeStructured<T>(systemPrompt: string, userMessage: string, schema: string): Promise<T>;
}

export class AnthropicClient implements AIClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    });

    const first = response.content[0];
    if (!first || first.type !== "text") {
      throw new Error("Unexpected Anthropic response content");
    }
    return first.text;
  }

  async completeStructured<T>(systemPrompt: string, userMessage: string, schema: string): Promise<T> {
    const instruction = `${systemPrompt}\n\nReturn JSON only. Follow this schema exactly:\n${schema}`;
    const raw = await this.complete(instruction, userMessage);
    return extractJson<T>(raw);
  }
}

export class StubAIClient implements AIClient {
  constructor(private readonly responder: (systemPrompt: string, userMessage: string) => string | Promise<string>) {}

  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    return this.responder(systemPrompt, userMessage);
  }

  async completeStructured<T>(systemPrompt: string, userMessage: string): Promise<T> {
    const value = await this.responder(systemPrompt, userMessage);
    return extractJson<T>(value);
  }
}

export function createAIClient(): AIClient {
  const cfg = getConfig();
  if (!cfg.anthropicApiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ANTHROPIC_API_KEY is required in production");
    }
    return new StubAIClient(() => JSON.stringify({ message: "AI key missing" }));
  }
  return new AnthropicClient(cfg.anthropicApiKey, cfg.aiModel);
}
