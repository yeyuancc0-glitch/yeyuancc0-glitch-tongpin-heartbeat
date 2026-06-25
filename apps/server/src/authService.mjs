import { createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";

import { withTransaction } from "./db.mjs";
import { createAccessToken, createOpaqueToken, hashOpaqueToken, verifyAccessToken } from "./tokens.mjs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthError extends Error {
  constructor(code, statusCode = 400, message = "Authentication request failed.") {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertEmail(email) {
  if (!emailPattern.test(email) || email.length > 254) {
    throw new AuthError("invalid_email", 400, "A valid email address is required.");
  }
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    throw new AuthError("invalid_password", 400, "Password must be between 8 and 256 characters.");
  }
}

function hashUserAgent(userAgent) {
  if (!userAgent) {
    return null;
  }
  return createHash("sha256").update(String(userAgent).slice(0, 600)).digest("hex");
}

function ipPrefix(value) {
  const first = String(value || "").split(",")[0].trim();
  if (!first) {
    return null;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(first)) {
    return first.split(".").slice(0, 3).join(".");
  }
  if (first.includes(":")) {
    return first.split(":").slice(0, 4).join(":");
  }
  return null;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified_at),
    disabled: Boolean(row.disabled_at),
    profile: {
      displayName: row.display_name,
      avatarStoragePath: row.avatar_storage_path,
      avatarThumbnailStoragePath: row.avatar_thumbnail_storage_path,
      birthday: row.birthday,
    },
  };
}

function sessionPayload(config, userId, sessionId, refreshToken, refreshExpiresAt) {
  const access = createAccessToken({
    userId,
    sessionId,
    secret: config.auth.accessTokenSecret,
    kid: config.auth.accessTokenCurrentKid,
    ttlSeconds: config.auth.accessTokenTtlSeconds,
  });

  return {
    tokenType: "Bearer",
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

function publicSession(row, currentSessionId) {
  return {
    id: row.id,
    current: row.id === currentSessionId,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    userAgentHash: row.user_agent_hash,
    ipPrefix: row.ip_prefix,
  };
}

function maybeDebugToken(config, token) {
  return config.auth.exposeDebugTokens ? { debugToken: token } : {};
}

function authEmailStatus(config, delivery) {
  if (delivery?.status === "sent") {
    return "sent";
  }
  return config.auth.emailDeliveryConfigured ? "delivery_failed" : "email_delivery_not_configured";
}

function noEmailService() {
  return {
    sendVerificationEmail: async () => ({ status: "skipped", reason: "email_delivery_not_configured" }),
    sendPasswordResetEmail: async () => ({ status: "skipped", reason: "email_delivery_not_configured" }),
  };
}

async function safeEmailDelivery(send) {
  try {
    return await send();
  } catch (error) {
    console.error({
      event: "auth_email_delivery_failed",
      provider: error?.provider || "unknown",
      providerCode: error?.providerCode || "unknown",
      statusCode: error?.statusCode || null,
    });
    return {
      status: "failed",
      reason: "email_delivery_failed",
      provider: error?.provider || "unknown",
      providerCode: error?.providerCode || "unknown",
    };
  }
}

async function loadUserById(client, userId) {
  const result = await client.query(
    `
      select
        accounts.id,
        accounts.email::text as email,
        accounts.email_verified_at,
        accounts.disabled_at,
        profiles.display_name,
        profiles.avatar_storage_path,
        profiles.avatar_thumbnail_storage_path,
        profiles.birthday
        from app_auth.accounts
      left join public.profiles on profiles.id = accounts.id
      where accounts.id = $1
    `,
    [userId],
  );
  return result.rows[0] || null;
}

async function createSession(client, config, userId, requestMeta, tokenFamilyId = null, rotatedFromSessionId = null) {
  const refreshToken = createOpaqueToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken, config.auth.refreshTokenPepper);
  const refreshExpiresAt = new Date(Date.now() + config.auth.refreshTokenTtlSeconds * 1000);
  const familyId = tokenFamilyId || randomUUID();
  const result = await client.query(
    `
      insert into app_auth.refresh_sessions (
        user_id,
        token_family_id,
        refresh_token_hash,
        rotated_from_session_id,
        expires_at,
        user_agent_hash,
        ip_prefix
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id
    `,
    [
      userId,
      familyId,
      refreshTokenHash,
      rotatedFromSessionId,
      refreshExpiresAt,
      hashUserAgent(requestMeta.userAgent),
      ipPrefix(requestMeta.ip),
    ],
  );

  const sessionId = result.rows[0].id;
  return {
    sessionId,
    session: sessionPayload(config, userId, sessionId, refreshToken, refreshExpiresAt),
  };
}

export function createAuthService({ pool, config, emailService = noEmailService() }) {
  async function ensureLoginAllowed(client, email, requestMeta) {
    const result = await client.query(
      `
        select count(*)::int as failures
        from app_auth.login_attempts
        where succeeded = false
          and created_at >= now() - ($1::int * interval '1 second')
          and (
            email = $2::citext
            or ($3::text is not null and ip_prefix = $3::text)
          )
      `,
      [config.auth.loginFailureWindowSeconds, email, ipPrefix(requestMeta.ip)],
    );
    if ((result.rows[0]?.failures ?? 0) >= config.auth.loginFailureLimit) {
      throw new AuthError("login_rate_limited", 429, "Too many login attempts. Please try again later.");
    }
  }

  async function recordLoginAttempt(client, email, requestMeta, succeeded) {
    await client.query(
      `
        insert into app_auth.login_attempts (email, ip_prefix, succeeded)
        values ($1, $2, $3)
      `,
      [email || null, ipPrefix(requestMeta.ip), succeeded],
    );
  }

  async function register(input, requestMeta) {
    const email = normalizeEmail(input.email);
    const password = input.password;
    const displayName = String(input.displayName || "").trim().slice(0, 80) || null;
    assertEmail(email);
    assertPassword(password);

    const result = await withTransaction(pool, async (client) => {
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });

      let account;
      try {
        const accountResult = await client.query(
          `
            insert into app_auth.accounts (email, password_hash)
            values ($1, $2)
            returning id, email::text as email, email_verified_at, disabled_at
          `,
          [email, passwordHash],
        );
        account = accountResult.rows[0];
      } catch (error) {
        if (error?.code === "23505") {
          throw new AuthError("email_already_registered", 409, "This email is already registered.");
        }
        throw error;
      }

      await client.query(
        `
          insert into public.profiles (id, display_name)
          values ($1, $2)
        `,
        [account.id, displayName],
      );

      const verificationToken = createOpaqueToken();
      await client.query(
        `
          insert into app_auth.email_verification_tokens (user_id, token_hash, expires_at)
          values ($1, $2, now() + interval '24 hours')
        `,
        [account.id, hashOpaqueToken(verificationToken, config.auth.refreshTokenPepper)],
      );

      const user = await loadUserById(client, account.id);
      return {
        accountId: account.id,
        verificationToken,
        user: publicUser(user),
        session: (await createSession(client, config, account.id, requestMeta)).session,
      };
    });
    const emailDelivery = await safeEmailDelivery(() => emailService.sendVerificationEmail({
      to: email,
      token: result.verificationToken,
      idempotencyKey: `verify:${result.accountId}:${hashOpaqueToken(result.verificationToken, config.auth.refreshTokenPepper).slice(0, 24)}`,
    }));
    return {
      user: result.user,
      session: result.session,
      emailVerification: {
        status: authEmailStatus(config, emailDelivery),
        delivery: emailDelivery,
        ...maybeDebugToken(config, result.verificationToken),
      },
    };
  }

  async function requestEmailVerification(input) {
    const email = normalizeEmail(input.email);
    assertEmail(email);
    const token = createOpaqueToken();

    let accountId = null;
    await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select id, email_verified_at
          from app_auth.accounts
          where email = $1::citext
            and disabled_at is null
          for update
        `,
        [email],
      );
      const account = result.rows[0];
      if (!account || account.email_verified_at) {
        return;
      }
      accountId = account.id;

      await client.query(
        `
          update app_auth.email_verification_tokens
             set consumed_at = coalesce(consumed_at, now())
           where user_id = $1
             and consumed_at is null
        `,
        [account.id],
      );
      await client.query(
        `
          insert into app_auth.email_verification_tokens (user_id, token_hash, expires_at)
          values ($1, $2, now() + interval '24 hours')
        `,
        [account.id, hashOpaqueToken(token, config.auth.refreshTokenPepper)],
      );
    });
    const delivery = accountId
      ? await safeEmailDelivery(() => emailService.sendVerificationEmail({
          to: email,
          token,
          idempotencyKey: `verify:${accountId}:${hashOpaqueToken(token, config.auth.refreshTokenPepper).slice(0, 24)}`,
        }))
      : { status: "skipped", reason: "account_not_found_or_already_verified" };

    return {
      status: authEmailStatus(config, delivery),
      delivery,
      ...maybeDebugToken(config, token),
    };
  }

  async function confirmEmailVerification(input) {
    const token = String(input.token || "");
    if (token.length < 40 || token.length > 300) {
      throw new AuthError("invalid_verification_token", 400, "Verification token is invalid.");
    }
    const tokenHash = hashOpaqueToken(token, config.auth.refreshTokenPepper);

    return withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select id, user_id, expires_at, consumed_at
          from app_auth.email_verification_tokens
          where token_hash = $1
          for update
        `,
        [tokenHash],
      );
      const tokenRow = result.rows[0];
      if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        throw new AuthError("invalid_verification_token", 400, "Verification token is invalid.");
      }

      await client.query(
        `
          update app_auth.accounts
             set email_verified_at = coalesce(email_verified_at, now()),
                 updated_at = now()
           where id = $1
             and disabled_at is null
        `,
        [tokenRow.user_id],
      );
      await client.query(
        `
          update app_auth.email_verification_tokens
             set consumed_at = coalesce(consumed_at, now())
           where user_id = $1
             and consumed_at is null
        `,
        [tokenRow.user_id],
      );
      const user = await loadUserById(client, tokenRow.user_id);
      return {
        status: "ok",
        user: publicUser(user),
      };
    });
  }

  async function login(input, requestMeta) {
    const email = normalizeEmail(input.email);
    const password = input.password;
    assertEmail(email);
    assertPassword(password);

    return withTransaction(pool, async (client) => {
      await ensureLoginAllowed(client, email, requestMeta);
      const result = await client.query(
        `
          select id, email::text as email, password_hash, disabled_at
          from app_auth.accounts
          where email = $1::citext
          for update
        `,
        [email],
      );
      const account = result.rows[0];
      const verified = account ? await argon2.verify(account.password_hash, password) : false;

      if (!account || !verified || account.disabled_at) {
        await recordLoginAttempt(client, email, requestMeta, false);
        throw new AuthError("invalid_credentials", 401, "Invalid email or password.");
      }

      await recordLoginAttempt(client, email, requestMeta, true);
      const { session } = await createSession(client, config, account.id, requestMeta);
      const user = await loadUserById(client, account.id);
      return {
        user: publicUser(user),
        session,
      };
    });
  }

  async function refresh(input, requestMeta) {
    const refreshToken = String(input.refreshToken || "");
    if (refreshToken.length < 40 || refreshToken.length > 300) {
      throw new AuthError("invalid_refresh_token", 401, "Refresh token is invalid.");
    }
    const tokenHash = hashOpaqueToken(refreshToken, config.auth.refreshTokenPepper);

    const client = await pool.connect();
    let committed = false;
    try {
      await client.query("begin");
      const result = await client.query(
        `
          select
            refresh_sessions.id,
            refresh_sessions.user_id,
            refresh_sessions.token_family_id,
            refresh_sessions.status,
            refresh_sessions.expires_at,
            accounts.disabled_at
          from app_auth.refresh_sessions
          join app_auth.accounts on accounts.id = refresh_sessions.user_id
          where refresh_token_hash = $1
          for update
        `,
        [tokenHash],
      );
      const session = result.rows[0];
      if (!session) {
        await client.query("rollback");
        committed = true;
        throw new AuthError("invalid_refresh_token", 401, "Refresh token is invalid.");
      }

      const expired = new Date(session.expires_at).getTime() <= Date.now();
      if (session.status !== "active" || expired || session.disabled_at) {
        await client.query(
          `
            update app_auth.refresh_sessions
               set status = case when $2::text = 'rotated' then 'reused' else 'revoked' end,
                   reuse_detected_at = case when $2::text = 'rotated' then coalesce(reuse_detected_at, now()) else reuse_detected_at end,
                   revoked_at = coalesce(revoked_at, now())
             where token_family_id = $1
               and status in ('active', 'rotated')
          `,
          [session.token_family_id, session.status],
        );
        await client.query("commit");
        committed = true;
        throw new AuthError("invalid_refresh_token", 401, "Refresh token is invalid.");
      }

      await client.query(
        `
          update app_auth.refresh_sessions
             set status = 'rotated',
                 last_seen_at = now()
           where id = $1
        `,
        [session.id],
      );

      const created = await createSession(client, config, session.user_id, requestMeta, session.token_family_id, session.id);
      const user = await loadUserById(client, session.user_id);
      await client.query("commit");
      committed = true;
      return {
        user: publicUser(user),
        session: created.session,
      };
    } catch (error) {
      if (!committed) {
        try {
          await client.query("rollback");
        } catch (rollbackError) {
          console.error({
            event: "postgres_rollback_failed",
            message: rollbackError instanceof Error ? rollbackError.message : "unknown rollback error",
          });
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function logout(input) {
    const refreshToken = String(input.refreshToken || "");
    if (!refreshToken) {
      return { status: "ok" };
    }
    const tokenHash = hashOpaqueToken(refreshToken, config.auth.refreshTokenPepper);
    await pool.query(
      `
        update app_auth.refresh_sessions
           set status = 'revoked',
               revoked_at = coalesce(revoked_at, now())
         where refresh_token_hash = $1
           and status = 'active'
      `,
      [tokenHash],
    );
    return { status: "ok" };
  }

  async function authenticate(accessToken) {
    let claims;
    try {
      claims = verifyAccessToken(accessToken, config.auth.accessTokenSecret, new Date(), config.auth.accessTokenKeys);
    } catch (error) {
      throw new AuthError("auth_required", 401, "Authentication is required for this endpoint.");
    }

    const result = await pool.query(
      `
        select
          refresh_sessions.id as session_id,
          refresh_sessions.status,
          refresh_sessions.expires_at,
          accounts.disabled_at,
          accounts.id,
          accounts.email::text as email,
          accounts.email_verified_at,
          profiles.display_name,
          profiles.avatar_storage_path,
          profiles.avatar_thumbnail_storage_path,
          profiles.birthday
        from app_auth.refresh_sessions
        join app_auth.accounts on accounts.id = refresh_sessions.user_id
        left join public.profiles on profiles.id = accounts.id
        where refresh_sessions.id = $1
          and refresh_sessions.user_id = $2
      `,
      [claims.sessionId, claims.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== "active" || row.disabled_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AuthError("auth_required", 401, "Authentication is required for this endpoint.");
    }
    return {
      user: publicUser(row),
      sessionId: row.session_id,
    };
  }

  async function logoutAll(userId) {
    await pool.query(
      `
        update app_auth.refresh_sessions
           set status = 'revoked',
               revoked_at = coalesce(revoked_at, now())
         where user_id = $1
           and status = 'active'
      `,
      [userId],
    );
    return { status: "ok" };
  }

  async function listSessions(current) {
    const result = await pool.query(
      `
        select id,
               status,
               created_at,
               last_seen_at,
               expires_at,
               revoked_at,
               user_agent_hash,
               ip_prefix
          from app_auth.refresh_sessions
         where user_id = $1
           and status = 'active'
           and expires_at > now()
         order by (id = $2) desc, coalesce(last_seen_at, created_at) desc
      `,
      [current.user.id, current.sessionId],
    );
    return {
      sessions: result.rows.map((row) => publicSession(row, current.sessionId)),
    };
  }

  async function revokeSession(input, current) {
    const sessionId = String(input.sessionId || input.session_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new AuthError("invalid_session_id", 400, "A valid session id is required.");
    }
    if (sessionId === current.sessionId) {
      throw new AuthError("cannot_revoke_current_session", 400, "Use logout to revoke the current session.");
    }
    const result = await pool.query(
      `
        update app_auth.refresh_sessions
           set status = 'revoked',
               revoked_at = coalesce(revoked_at, now())
         where id = $1
           and user_id = $2
           and status = 'active'
        returning id
      `,
      [sessionId, current.user.id],
    );
    if (!result.rows[0]) {
      throw new AuthError("session_not_found", 404, "Session not found.");
    }
    return { status: "ok" };
  }

  async function requestPasswordReset(input) {
    const email = normalizeEmail(input.email);
    assertEmail(email);
    const token = createOpaqueToken();

    let accountId = null;
    await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select id
          from app_auth.accounts
          where email = $1::citext
            and disabled_at is null
          for update
        `,
        [email],
      );
      const account = result.rows[0];
      if (!account) {
        return;
      }
      accountId = account.id;

      await client.query(
        `
          update app_auth.password_reset_tokens
             set consumed_at = coalesce(consumed_at, now())
           where user_id = $1
             and consumed_at is null
        `,
        [account.id],
      );
      await client.query(
        `
          insert into app_auth.password_reset_tokens (user_id, token_hash, expires_at)
          values ($1, $2, now() + interval '1 hour')
        `,
        [account.id, hashOpaqueToken(token, config.auth.refreshTokenPepper)],
      );
    });
    if (!accountId) {
      throw new AuthError("account_not_found", 404, "未找到这个邮箱对应的账号。");
    }

    const delivery = await safeEmailDelivery(() => emailService.sendPasswordResetEmail({
      to: email,
      token,
      idempotencyKey: `reset:${accountId}:${hashOpaqueToken(token, config.auth.refreshTokenPepper).slice(0, 24)}`,
    }));

    return {
      status: authEmailStatus(config, delivery),
      delivery,
      ...maybeDebugToken(config, token),
    };
  }

  async function confirmPasswordReset(input) {
    const token = String(input.token || "");
    const password = input.password;
    if (token.length < 40 || token.length > 300) {
      throw new AuthError("invalid_reset_token", 400, "Password reset token is invalid.");
    }
    assertPassword(password);
    const tokenHash = hashOpaqueToken(token, config.auth.refreshTokenPepper);
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    return withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select id, user_id, expires_at, consumed_at
          from app_auth.password_reset_tokens
          where token_hash = $1
          for update
        `,
        [tokenHash],
      );
      const tokenRow = result.rows[0];
      if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        throw new AuthError("invalid_reset_token", 400, "Password reset token is invalid.");
      }

      await client.query(
        `
          update app_auth.accounts
             set password_hash = $2,
                 password_hash_algorithm = 'argon2id',
                 updated_at = now()
           where id = $1
             and disabled_at is null
        `,
        [tokenRow.user_id, passwordHash],
      );
      await client.query(
        `
          update app_auth.password_reset_tokens
             set consumed_at = coalesce(consumed_at, now())
           where user_id = $1
             and consumed_at is null
        `,
        [tokenRow.user_id],
      );
      await client.query(
        `
          update app_auth.refresh_sessions
             set status = 'revoked',
                 revoked_at = coalesce(revoked_at, now())
           where user_id = $1
             and status = 'active'
        `,
        [tokenRow.user_id],
      );
      return { status: "ok" };
    });
  }

  return {
    authenticate,
    confirmEmailVerification,
    confirmPasswordReset,
    login,
    listSessions,
    logout,
    logoutAll,
    refresh,
    register,
    revokeSession,
    requestEmailVerification,
    requestPasswordReset,
  };
}
