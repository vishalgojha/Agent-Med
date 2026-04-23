import { AIClient, createAIClient } from "./ai/client.js";
import { runDecisionSupport } from "./capabilities/decision-support.js";
import {
  dispatchDueFollowUps,
  requeueDeadLetterFollowUp,
  retryFailedFollowUp,
  retryFailedFollowUpsBulk,
  runFollowUp,
  FollowUpTrigger
} from "./capabilities/follow-up.js";
import { runPriorAuth, updatePriorAuthStatus, PriorAuthStatus } from "./capabilities/prior-auth.js";
import { runScribe } from "./capabilities/scribe.js";
import { getConfig } from "./config.js";
import { CapabilityName, Intent } from "./types.js";
import { MessagingAdapter } from "./messaging/interface.js";
import { StubMessagingAdapter } from "./messaging/stub.js";
import { TwilioMessagingAdapter } from "./messaging/twilio.js";

export interface RuntimeDeps {
  aiClient: AIClient;
  messaging: MessagingAdapter;
}

export function createRuntimeDeps(overrides?: Partial<RuntimeDeps>): RuntimeDeps {
  const cfg = getConfig();
  const defaults: RuntimeDeps = {
    aiClient: createAIClient(),
    messaging: cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFromNumber
      ? new TwilioMessagingAdapter()
      : new StubMessagingAdapter()
  };

  return { ...defaults, ...overrides };
}

export function createCapabilityHandlers(deps: RuntimeDeps): Record<CapabilityName, (intent: Intent) => Promise<unknown>> {
  return {
    scribe: async (intent: Intent) =>
      runScribe({
        transcript: intent.payload.transcript as string | undefined,
        filePath: intent.payload.filePath as string | undefined,
        patientId: intent.patientId ?? String(intent.payload.patientId ?? ""),
        doctorId: intent.doctorId,
        aiClient: deps.aiClient
      }),
    prior_auth: async (intent: Intent) =>
      intent.payload.mode === "status_update"
        ? updatePriorAuthStatus(
            String(intent.payload.priorAuthId ?? ""),
            String(intent.payload.status ?? "draft") as PriorAuthStatus
          )
        : runPriorAuth({
            patientId: intent.patientId ?? String(intent.payload.patientId ?? ""),
            doctorId: intent.doctorId,
            procedureCode: String(intent.payload.procedureCode ?? ""),
            diagnosisCodes: (intent.payload.diagnosisCodes as string[] | undefined) ?? [],
            insurerId: String(intent.payload.insurerId ?? ""),
            submit: Boolean(intent.payload.submit),
            aiClient: deps.aiClient
          }),
    follow_up: async (intent: Intent) =>
      intent.payload.mode === "retry_failed"
        ? retryFailedFollowUp({
            id: String(intent.payload.followUpId ?? ""),
            messaging: deps.messaging,
            dryRun: intent.dryRun
          })
        : intent.payload.mode === "requeue_dead_letter"
          ? requeueDeadLetterFollowUp({
              deadLetterId: String(intent.payload.deadLetterId ?? ""),
              dryRun: intent.dryRun
            })
        : intent.payload.mode === "retry_failed_bulk"
          ? retryFailedFollowUpsBulk({
              messaging: deps.messaging,
              dryRun: intent.dryRun,
              limit: Number(intent.payload.limit ?? 25)
            })
        : intent.payload.mode === "dispatch_due"
          ? dispatchDueFollowUps({
              messaging: deps.messaging,
              dryRun: intent.dryRun,
              limit: Number(intent.payload.limit ?? 50)
            })
          : runFollowUp({
              patientId: intent.patientId ?? String(intent.payload.patientId ?? ""),
              doctorId: intent.doctorId,
              trigger: String(intent.payload.trigger ?? "custom") as FollowUpTrigger,
              customMessage: intent.payload.customMessage as string | undefined,
              channel: (intent.payload.channel as "sms" | "whatsapp" | undefined) ?? "sms",
              sendNow: Boolean(intent.payload.sendNow),
              dryRun: intent.dryRun,
              aiClient: deps.aiClient,
              messaging: deps.messaging
            }),
    decision_support: async (intent: Intent) =>
      runDecisionSupport({
        aiClient: deps.aiClient,
        patientId: intent.patientId,
        meds: intent.payload.meds as string[] | undefined,
        allergies: intent.payload.allergies as string[] | undefined,
        age: intent.payload.age as number | undefined,
        weight: intent.payload.weight as number | undefined,
        query: String(intent.payload.query ?? "")
      })
  };
}
