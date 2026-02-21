import { makeId } from "../utils.js";
import { MessagingAdapter } from "./interface.js";

export class StubMessagingAdapter implements MessagingAdapter {
  public sent: Array<{ to: string; body: string; channel: "sms" | "whatsapp" }> = [];

  async send(message: { to: string; body: string; channel: "sms" | "whatsapp" }): Promise<{ id: string }> {
    this.sent.push(message);
    return { id: makeId("msg") };
  }
}
