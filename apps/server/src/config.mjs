const defaultPort = 3000;
const defaultPostgresPort = 5432;
const defaultRedisPort = 6379;

function parsePort(value, fallback = defaultPort) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const apiEnv = env.API_ENV || env.NODE_ENV || "staging";
  const accessTokenSecret = env.AUTH_ACCESS_TOKEN_SECRET || env.AUTH_TOKEN_SECRET || "";
  const refreshTokenPepper = env.AUTH_REFRESH_TOKEN_PEPPER || accessTokenSecret;
  const accessTokenKeys = parseAccessTokenKeys({
    rawKeys: env.AUTH_ACCESS_TOKEN_KEYS,
    currentKid: env.AUTH_ACCESS_TOKEN_CURRENT_KID,
    fallbackSecret: requiredSecret(accessTokenSecret, "AUTH_ACCESS_TOKEN_SECRET", apiEnv),
  });
  const email = emailConfig(env, apiEnv);

  return {
    apiEnv,
    nodeEnv: env.NODE_ENV || "development",
    port: parsePort(env.PORT),
    serviceName: env.SERVICE_NAME || "tongpin-self-host-api",
    allowedOrigins: splitCsv(env.CORS_ALLOWED_ORIGINS || env.APP_ORIGIN || "https://tongpin.fancah.tech,http://localhost:8081,http://localhost:19006"),
    auth: {
      accessTokenSecret: accessTokenKeys.current.secret,
      accessTokenCurrentKid: accessTokenKeys.current.kid,
      accessTokenKeys: accessTokenKeys.keys,
      refreshTokenPepper: requiredSecret(refreshTokenPepper, "AUTH_REFRESH_TOKEN_PEPPER", apiEnv),
      accessTokenTtlSeconds: parsePositiveInteger(env.AUTH_ACCESS_TOKEN_TTL_SECONDS, 15 * 60),
      refreshTokenTtlSeconds: parsePositiveInteger(env.AUTH_REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60),
      loginFailureWindowSeconds: parsePositiveInteger(env.AUTH_LOGIN_FAILURE_WINDOW_SECONDS, 15 * 60),
      loginFailureLimit: parsePositiveInteger(env.AUTH_LOGIN_FAILURE_LIMIT, 10),
      passwordResetWindowSeconds: parsePositiveInteger(env.AUTH_PASSWORD_RESET_WINDOW_SECONDS, 60 * 60),
      passwordResetEmailLimit: parsePositiveInteger(env.AUTH_PASSWORD_RESET_EMAIL_LIMIT, 3),
      passwordResetIpLimit: parsePositiveInteger(env.AUTH_PASSWORD_RESET_IP_LIMIT, 10),
      passwordResetReuseSeconds: parsePositiveInteger(env.AUTH_PASSWORD_RESET_REUSE_SECONDS, 10 * 60),
      emailVerificationWindowSeconds: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_WINDOW_SECONDS, 60 * 60),
      emailVerificationEmailLimit: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_EMAIL_LIMIT, 3),
      emailVerificationIpLimit: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_IP_LIMIT, 10),
      emailVerificationReuseSeconds: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_REUSE_SECONDS, 10 * 60),
      emailDeliveryConfigured: env.AUTH_EMAIL_DELIVERY_CONFIGURED === "true" || email.configured,
      exposeDebugTokens: env.AUTH_EXPOSE_DEBUG_TOKENS === "true" || (apiEnv !== "production" && !email.configured && env.AUTH_EMAIL_DELIVERY_CONFIGURED !== "true"),
    },
    email,
    database: {
      host: env.POSTGRES_HOST || "127.0.0.1",
      port: parsePort(env.POSTGRES_PORT || "5432", defaultPostgresPort),
      database: env.POSTGRES_DB || "tongpin_staging",
      user: env.POSTGRES_USER || "tongpin_app",
      password: env.POSTGRES_PASSWORD || "",
      max: parsePositiveInteger(env.POSTGRES_POOL_MAX, 8),
      idleTimeoutMillis: parsePositiveInteger(env.POSTGRES_IDLE_TIMEOUT_MS, 30_000),
      connectionTimeoutMillis: parsePositiveInteger(env.POSTGRES_CONNECTION_TIMEOUT_MS, 3_000),
    },
    storage: {
      bucket: env.MINIO_COUPLE_MEDIA_BUCKET || "couple-media",
      avatarBucket: env.MINIO_PROFILE_AVATAR_BUCKET || "profile-avatars",
      endpoint: endpointUrl(env.MINIO_ENDPOINT || "127.0.0.1:9000"),
      publicEndpoint: endpointUrl(env.MINIO_PUBLIC_ENDPOINT || env.MINIO_ENDPOINT || "127.0.0.1:9000"),
      region: env.MINIO_REGION || "us-east-1",
      accessKeyId: env.MINIO_ROOT_USER || "",
      secretAccessKey: env.MINIO_ROOT_PASSWORD || "",
      signedUrlTtlSeconds: parsePositiveInteger(env.STORAGE_SIGNED_URL_TTL_SECONDS, 10 * 60),
      maxUploadBytes: parsePositiveInteger(env.STORAGE_MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
      maxThumbnailUploadBytes: parsePositiveInteger(env.STORAGE_MAX_THUMBNAIL_UPLOAD_BYTES, 1024 * 1024),
      maxAvatarUploadBytes: parsePositiveInteger(env.STORAGE_MAX_AVATAR_UPLOAD_BYTES, 4 * 1024 * 1024),
      maxAvatarThumbnailBytes: parsePositiveInteger(env.STORAGE_MAX_AVATAR_THUMBNAIL_BYTES, 1024 * 1024),
      allowedMimeTypes: splitCsv(env.STORAGE_ALLOWED_MIME_TYPES || "image/jpeg,image/png,image/webp,image/gif"),
    },
    push: {
      workerEnabled: env.PUSH_WORKER_ENABLED !== "false",
      workerIntervalMs: parsePositiveInteger(env.PUSH_WORKER_INTERVAL_MS, 10_000),
      maxDeliveriesPerRun: parsePositiveInteger(env.PUSH_WORKER_MAX_DELIVERIES_PER_RUN, 50),
      maxDeliveryAttempts: parsePositiveInteger(env.PUSH_WORKER_MAX_DELIVERY_ATTEMPTS, 3),
      maxTokensPerUser: parsePositiveInteger(env.PUSH_WORKER_MAX_TOKENS_PER_USER, 10),
      deliveryTtlSeconds: parsePositiveInteger(env.PUSH_DELIVERY_TTL_SECONDS, 5 * 60),
      staleClaimSeconds: parsePositiveInteger(env.PUSH_WORKER_STALE_CLAIM_SECONDS, 2 * 60),
      retryBaseSeconds: parsePositiveInteger(env.PUSH_WORKER_RETRY_BASE_SECONDS, 30),
      expoEndpoint: env.EXPO_PUSH_ENDPOINT || "https://exp.host/--/api/v2/push/send",
      vapidSubject: env.WEB_PUSH_VAPID_SUBJECT || "mailto:admin@fancah.tech",
      vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY || "",
      vapidPrivateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY || "",
    },
    dependencies: {
      postgres: {
        host: env.POSTGRES_HOST || "127.0.0.1",
        port: parsePort(env.POSTGRES_PORT || "5432", defaultPostgresPort),
      },
      redis: {
        host: env.REDIS_HOST || "127.0.0.1",
        port: parsePort(env.REDIS_PORT || "6379", defaultRedisPort),
      },
      minio: parseEndpoint(env.MINIO_ENDPOINT || "127.0.0.1:9000"),
    },
  };
}

function emailConfig(env, apiEnv) {
  const provider = String(env.EMAIL_PROVIDER || "none").trim().toLowerCase();
  if (!["none", "resend"].includes(provider)) {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }
  const resendApiKey = env.RESEND_API_KEY || "";
  const from = env.EMAIL_FROM || "";
  const appOrigin = env.APP_ORIGIN || "https://tongpin.fancah.tech";
  const configured = provider === "resend" && Boolean(resendApiKey && from);
  if (env.AUTH_EMAIL_DELIVERY_CONFIGURED === "true" && !configured) {
    throw new Error("AUTH_EMAIL_DELIVERY_CONFIGURED=true requires EMAIL_PROVIDER=resend, RESEND_API_KEY, and EMAIL_FROM.");
  }
  if (apiEnv === "production" && provider !== "none" && !configured) {
    throw new Error("Production email provider is partially configured.");
  }
  return {
    provider,
    configured,
    resendApiKey,
    from,
    appOrigin,
    verifyUrlBase: env.AUTH_EMAIL_VERIFY_URL_BASE || `${appOrigin.replace(/\/+$/, "")}/auth/verify-email`,
    resetUrlBase: env.AUTH_PASSWORD_RESET_URL_BASE || `${appOrigin.replace(/\/+$/, "")}/auth/reset-password`,
  };
}

function parseAccessTokenKeys({ rawKeys, currentKid, fallbackSecret }) {
  const fallback = {
    current: { kid: "staging-hs256-v1", secret: fallbackSecret },
    keys: [{ kid: "staging-hs256-v1", secret: fallbackSecret }],
  };
  if (!rawKeys) {
    return fallback;
  }

  const keys = splitCsv(rawKeys).map((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error("AUTH_ACCESS_TOKEN_KEYS entries must use kid:secret format.");
    }
    const kid = entry.slice(0, separatorIndex).trim();
    const secret = entry.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(kid)) {
      throw new Error(`Invalid JWT kid: ${kid}`);
    }
    if (secret.length < 32) {
      throw new Error(`JWT key ${kid} secret must be at least 32 characters.`);
    }
    return { kid, secret };
  });

  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key.kid)) {
      throw new Error(`Duplicate JWT kid: ${key.kid}`);
    }
    seen.add(key.kid);
  }

  const selectedKid = currentKid || keys[0]?.kid;
  const current = keys.find((key) => key.kid === selectedKid);
  if (!current) {
    throw new Error("AUTH_ACCESS_TOKEN_CURRENT_KID must match one AUTH_ACCESS_TOKEN_KEYS kid.");
  }
  return { current, keys };
}

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function requiredSecret(value, name, apiEnv) {
  if (value && value.length >= 32) {
    return value;
  }
  if (apiEnv !== "production") {
    return `development-only-${name.toLowerCase()}-change-me-32-bytes`;
  }
  throw new Error(`${name} must be set to at least 32 characters in production.`);
}

function parseEndpoint(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return { host: "127.0.0.1", port: 9000 };
  }

  try {
    const withProtocol = text.includes("://") ? text : `http://${text}`;
    const url = new URL(withProtocol);
    return {
      host: url.hostname,
      port: parsePort(url.port || (url.protocol === "https:" ? "443" : "80")),
    };
  } catch (error) {
    throw new Error(`Invalid MINIO_ENDPOINT: ${value}`);
  }
}

function endpointUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "http://127.0.0.1:9000";
  }
  return text.includes("://") ? text : `http://${text}`;
}
