export interface MessagingAdapter {
  send(message: { to: string; body: string; channel: "sms" | "whatsapp" }): Promise<{ id: string }>;
}
