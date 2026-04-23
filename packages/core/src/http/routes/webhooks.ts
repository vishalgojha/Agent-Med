import { Router } from "express";
import twilio from "twilio";
import { readRequestBodyWithLimit, parseUrlEncodedFormBody, isRequestBodyLimitError, requestBodyErrorToText } from "../../http/body-limit.js";
import { createPersistentDedupe, resolveTwilioWebhookDedupePath } from "../../messaging/persistent-dedupe.js";
import { getFollowUpByProviderMessageId, updateFollowUpDeliveryByProviderMessageId } from "../../patients/store.js";
import { getConfig } from "../../config.js";
import { sendJson } from "../../utils.js";
import { appError } from "../../errors.js";

export function registerWebhookRoutes(router: Router) {
  const {
    twilioWebhookValidate,
    twilioWebhookAuthToken,
    twilioWebhookMaxBodyBytes,
    twilioWebhookBodyTimeoutMs,
    twilioWebhookDedupeTtlMs,
    publicBaseUrl
  } = getConfig();

  const webhookDedupe = createPersistentDedupe({
    ttlMs: twilioWebhookDedupeTtlMs,
    memoryMaxSize: 5_000,
    fileMaxEntries: 50_000,
    filePath: resolveTwilioWebhookDedupePath()
  });

  router.post("/twilio/status", async (req, res) => {
    try {
      const contentType = req.header("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
        sendJson(res, 415, appError("VALIDATION_ERROR", "Content-Type must be application/x-www-form-urlencoded"));
        return;
      }

      const rawBody = await readRequestBodyWithLimit(req, {
        maxBytes: twilioWebhookMaxBodyBytes,
        timeoutMs: twilioWebhookBodyTimeoutMs
      });
      const formBody = parseUrlEncodedFormBody(rawBody);

      if (twilioWebhookValidate) {
        const signature = req.header("x-twilio-signature");
        if (!signature) {
          sendJson(res, 403, appError("FORBIDDEN", "Missing Twilio signature"));
          return;
        }
        const host = req.header("host");
        const protocol = req.header("x-forwarded-proto") ?? req.protocol;
        const callbackUrl = publicBaseUrl
          ? `${publicBaseUrl.replace(/\/$/, "")}${req.originalUrl}`
          : `${protocol}://${host}${req.originalUrl}`;
        const valid = twilio.validateRequest(
          twilioWebhookAuthToken,
          signature,
          callbackUrl,
          formBody
        );
        if (!valid) {
          sendJson(res, 403, appError("FORBIDDEN", "Invalid Twilio signature"));
          return;
        }
      }

      const messageSid = formBody.MessageSid;
      const providerStatusRaw = formBody.MessageStatus;
      if (!messageSid || !providerStatusRaw) {
        sendJson(res, 422, appError("VALIDATION_ERROR", "MessageSid and MessageStatus are required"));
        return;
      }
      const normalizedStatus = providerStatusRaw.toLowerCase();
      const allowedStatus = ["queued", "sent", "delivered", "undelivered", "failed"];
      if (!allowedStatus.includes(normalizedStatus)) {
        sendJson(res, 422, appError("VALIDATION_ERROR", "Unsupported MessageStatus"));
        return;
      }

      const accepted = await webhookDedupe.checkAndRecord([
        messageSid ?? "",
        providerStatusRaw ?? "",
        formBody.ErrorCode ?? "",
        formBody.ErrorMessage ?? ""
      ].join("|"));

      if (!accepted) {
        const existing = getFollowUpByProviderMessageId(messageSid);
        sendJson(res, 200, { ok: true, data: existing, meta: { deduped: true, applied: false, ignoredReason: "persistent_duplicate" } });
        return;
      }

      const updated = updateFollowUpDeliveryByProviderMessageId({
        providerMessageId: messageSid,
        providerStatus: normalizedStatus as any,
        errorCode: formBody.ErrorCode,
        errorMessage: formBody.ErrorMessage,
        payload: JSON.stringify(formBody),
        at: new Date().toISOString()
      });
      if (!updated.record) {
        sendJson(res, 404, appError("NOT_FOUND", "No follow-up found for provider message id"));
        return;
      }

      sendJson(res, 200, { ok: true, data: updated.record, meta: { deduped: updated.deduped, applied: updated.applied, ignoredReason: updated.ignoredReason } });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "RequestBodyLimitError" || error.message?.includes("too large")) {
          sendJson(res, 413, appError("VALIDATION_ERROR", "Body too large"));
          return;
        }
        if (error.message?.includes("timeout")) {
          sendJson(res, 408, appError("VALIDATION_ERROR", "Request body timeout"));
          return;
        }
      }
      sendJson(res, 500, { ok: false, code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) });
    }
  });
}
