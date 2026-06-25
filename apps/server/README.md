# Tongpin Self-host API

This is the first self-hosted API/BFF landing point for the Supabase migration.

Current scope:

- `GET /health`
- `GET /api/health`
- `GET /api/health/deep`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/email/verify/request`
- `POST /api/auth/email/verify/confirm`
- `POST /api/auth/password/reset/request`
- `POST /api/auth/password/reset/confirm`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/me`
- `GET /api/couples/active`
- `POST /api/pair-invites`
- `POST /api/pair-invites/accept`
- `POST /api/media/uploads`
- `POST /api/media/uploads/complete`
- `GET /api/media`
- `POST /api/media/read-url`
- `POST /api/media/delete`
- Argon2id password hashing
- hashed refresh tokens with rotation and token-family reuse revocation
- email verification and password reset token consumption semantics
- optional Resend email delivery for verification and password reset messages
- password reset revokes active refresh sessions
- MinIO/S3 signed upload and read URLs for couple media
- DB-first pending upload records, server-side MIME/size verification, active-couple access checks, and delete synchronization
- request id generation
- JSON-only responses
- low-risk logging without request bodies or tokens

This server is not production-complete yet. Realtime/SSE, pet AI worker, data import, full production email configuration, and production cutover must follow:

- `docs/supabase-usage-inventory.md`
- `docs/self-host-authorization-map.md`
- `docs/self-host-data-constraints.md`
- `docs/self-host-cutover-rollback.md`
- `docs/self-host-security-ops.md`

Run locally:

```bash
npm run server:start
```

Check syntax:

```bash
npm run check:server
```

Run the staging Auth smoke test against a deployed API:

```bash
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:auth -w @tongpin/server
```

Run the staging Storage smoke test against a deployed API:

```bash
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:storage -w @tongpin/server
```

Email delivery:

- Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to send verification and password reset mail.
- Optional URL bases: `AUTH_EMAIL_VERIFY_URL_BASE` and `AUTH_PASSWORD_RESET_URL_BASE`.
- In non-production staging without email delivery, verification/reset request responses include a `debugToken` for smoke tests. Production must not expose these tokens.
