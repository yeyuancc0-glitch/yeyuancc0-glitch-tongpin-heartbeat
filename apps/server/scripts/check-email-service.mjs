import { createEmailService } from "../src/emailService.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const skipped = createEmailService({
  config: {
    email: {
      configured: false,
      provider: "none",
    },
  },
});
const skippedResult = await skipped.sendVerificationEmail({ to: "a@example.test", token: "token", idempotencyKey: "skip" });
assert(skippedResult.status === "skipped", "unconfigured email service should skip");

let captured = null;
const sent = createEmailService({
  config: {
    email: {
      configured: true,
      provider: "resend",
      resendApiKey: "test-api-key",
      from: "Tongpin <noreply@example.test>",
      verifyUrlBase: "https://tongpin.example.test/auth/verify-email",
      resetUrlBase: "https://tongpin.example.test/auth/reset-password",
    },
  },
  fetchImpl: async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "email_test_id" }),
    };
  },
});

const testRecipientResult = await sent.sendPasswordResetEmail({
  to: "b@example.test",
  token: "reset-token",
  idempotencyKey: "test-recipient",
});
assert(testRecipientResult.status === "skipped", "reserved .test recipients should not call Resend");
assert(testRecipientResult.reason === "test_email_recipient", "reserved .test skip reason mismatch");
assert(captured === null, "reserved .test recipient should not call fetch");

const result = await sent.sendPasswordResetEmail({
  to: "b@example.com",
  token: "reset-token",
  idempotencyKey: "reset-key",
});
assert(result.status === "sent", "configured resend service should return sent");
assert(captured.url === "https://api.resend.com/emails", "resend endpoint mismatch");
assert(captured.init.headers.Authorization === "Bearer test-api-key", "resend auth header missing");
assert(captured.init.headers["Idempotency-Key"] === "reset-key", "idempotency key missing");
assert(captured.body.from === "Tongpin <noreply@example.test>", "from mismatch");
assert(captured.body.to[0] === "b@example.com", "recipient mismatch");
assert(captured.body.text.includes("reset-token"), "reset token missing from email text");
assert(captured.body.text.includes("https://tongpin.example.test/auth/reset-password"), "reset URL missing from email text");

let quotaFetchCount = 0;
const quotaLimited = createEmailService({
  config: {
    email: {
      configured: true,
      provider: "resend",
      resendApiKey: "test-api-key",
      from: "Tongpin <noreply@example.test>",
      verifyUrlBase: "https://tongpin.example.test/auth/verify-email",
      resetUrlBase: "https://tongpin.example.test/auth/reset-password",
    },
  },
  fetchImpl: async () => {
    quotaFetchCount += 1;
    return {
      ok: false,
      status: 429,
      json: async () => ({ name: "daily_quota_exceeded" }),
    };
  },
});

await quotaLimited.sendVerificationEmail({
  to: "quota@example.com",
  token: "verify-token",
  idempotencyKey: "quota-1",
}).then(() => {
  throw new Error("daily quota response should throw on first Resend failure");
}).catch((error) => {
  assert(error?.providerCode === "daily_quota_exceeded", "daily quota provider code mismatch");
});
const quotaSkippedResult = await quotaLimited.sendVerificationEmail({
  to: "quota-next@example.com",
  token: "verify-token",
  idempotencyKey: "quota-2",
});
assert(quotaFetchCount === 1, "daily quota cooldown should prevent repeated Resend calls");
assert(quotaSkippedResult.status === "skipped", "daily quota cooldown should skip delivery");
assert(quotaSkippedResult.reason === "resend_daily_quota_exceeded", "daily quota cooldown reason mismatch");

console.log(JSON.stringify({ status: "ok", checks: ["email_skip_without_provider", "test_recipient_skip", "resend_payload", "resend_idempotency", "resend_daily_quota_cooldown"] }));
