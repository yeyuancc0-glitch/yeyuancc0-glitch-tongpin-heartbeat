export function createEmailService({ config, fetchImpl = globalThis.fetch }) {
  async function sendEmail({ to, subject, text, html, idempotencyKey }) {
    if (!config.email.configured) {
      return { status: "skipped", reason: "email_delivery_not_configured" };
    }
    if (config.email.provider !== "resend") {
      return { status: "skipped", reason: "email_provider_not_supported" };
    }
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("email_delivery_failed");
      error.statusCode = response.status;
      error.provider = "resend";
      error.providerCode = body?.name || body?.error || body?.message || "resend_error";
      throw error;
    }
    return { status: "sent", provider: "resend", providerId: body?.id ?? null };
  }

  function urlWithToken(base, token) {
    const url = new URL(base);
    url.searchParams.set("token", token);
    return url.toString();
  }

  async function sendVerificationEmail({ to, token, idempotencyKey }) {
    if (!config.email.configured) {
      return sendEmail({ to, subject: "", text: "", html: "", idempotencyKey });
    }
    const link = urlWithToken(config.email.verifyUrlBase, token);
    return sendEmail({
      to,
      subject: "验证你的同频跳动邮箱",
      text: `请打开以下链接完成邮箱验证：\n${link}\n\n如果不是你本人操作，可以忽略这封邮件。`,
      html: `<p>请打开以下链接完成邮箱验证：</p><p><a href="${escapeHtml(link)}">验证邮箱</a></p><p>如果不是你本人操作，可以忽略这封邮件。</p>`,
      idempotencyKey,
    });
  }

  async function sendPasswordResetEmail({ to, token, idempotencyKey }) {
    if (!config.email.configured) {
      return sendEmail({ to, subject: "", text: "", html: "", idempotencyKey });
    }
    const link = urlWithToken(config.email.resetUrlBase, token);
    return sendEmail({
      to,
      subject: "重置你的同频跳动密码",
      text: `你的密码重置验证码：${token}\n\n也可以打开以下链接：\n${link}\n\n如果不是你本人操作，可以忽略这封邮件。`,
      html: `<p>你的密码重置验证码：</p><p><code>${escapeHtml(token)}</code></p><p><a href="${escapeHtml(link)}">打开重置密码页面</a></p><p>如果不是你本人操作，可以忽略这封邮件。</p>`,
      idempotencyKey,
    });
  }

  return {
    sendPasswordResetEmail,
    sendVerificationEmail,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
