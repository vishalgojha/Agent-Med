import twilio from "twilio";
import { getConfig } from "../config.js";
import { MessagingAdapter } from "./interface.js";

export class TwilioMessagingAdapter implements MessagingAdapter {
  private readonly client;
  private readonly fromNumber: string;

  constructor() {
    const cfg = getConfig();
    this.client = twilio(cfg.twilioAccountSid, cfg.twilioAuthToken);
    this.fromNumber = cfg.twilioFromNumber;
  }

  async send(message: { to: string; body: string; channel: "sms" | "whatsapp" }): Promise<{ id: string }> {
    const to = message.channel === "whatsapp" ? `whatsapp:${message.to}` : message.to;
    const from = message.channel === "whatsapp" ? `whatsapp:${this.fromNumber}` : this.fromNumber;

    const result = await this.client.messages.create({
      to,
      from,
      body: message.body
    });

    return { id: result.sid };
  }
}
