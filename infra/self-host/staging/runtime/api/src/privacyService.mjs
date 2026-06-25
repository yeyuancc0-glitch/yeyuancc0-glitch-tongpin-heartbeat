import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function trimmedText(value, maxLength, code, message) {
  const text = String(value || "").trim();
  if (!text) {
    throw new AuthError(code, 400, message);
  }
  return text.slice(0, maxLength);
}

function optionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function publicFeedback(row) {
  return {
    id: row.id,
    userId: row.user_id,
    coupleId: row.couple_id,
    body: row.body,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function publicReport(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    reporterId: row.reporter_id,
    reportedUserId: row.reported_user_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
  };
}

function publicDeletionRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
  };
}

function publicBlock(row) {
  return {
    id: row.id,
    blockerId: row.blocker_id,
    blockedUserId: row.blocked_user_id,
    coupleId: row.couple_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

async function findActiveCoupleForUpdate(client, userId) {
  const result = await client.query(
    `
      select c.*
      from public.couples c
      join public.couple_members cm on cm.couple_id = c.id
      where cm.user_id = $1
        and cm.status = 'active'
        and c.status = 'active'
      order by c.created_at desc
      limit 1
      for update of c
    `,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function activePartnerId(client, coupleId, userId) {
  const result = await client.query(
    `
      select cm.user_id
      from public.couple_members cm
      where cm.couple_id = $1
        and cm.user_id <> $2
        and cm.status = 'active'
      limit 1
    `,
    [coupleId, userId],
  );
  return result.rows[0]?.user_id ?? null;
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

async function endCoupleRows(client, coupleId) {
  const endedCouple = await client.query(
    `
      update public.couples
         set status = 'ended',
             ended_at = coalesce(ended_at, now())
       where id = $1
         and status = 'active'
      returning *
    `,
    [coupleId],
  );
  await client.query(
    `
      update public.couple_members
         set status = 'left',
             left_at = coalesce(left_at, now())
       where couple_id = $1
         and status = 'active'
    `,
    [coupleId],
  );
  return endedCouple.rows[0] ?? null;
}

function publicEndedCouple(row) {
  return {
    id: row.id,
    relationshipStartedAt: row.relationship_started_at instanceof Date ? row.relationship_started_at.toISOString().slice(0, 10) : row.relationship_started_at ? String(row.relationship_started_at).slice(0, 10) : null,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    status: row.status,
  };
}

export function createPrivacyService({ pool }) {
  async function submitFeedback(input, current) {
    const body = trimmedText(input.body ?? input.feedbackBody ?? input.feedback_body, 1000, "feedback_body_required", "Feedback body is required.");
    const coupleId = input.coupleId ?? input.couple_id ?? input.targetCoupleId ?? input.target_couple_id ?? null;
    const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};

    const feedback = await withTransaction(pool, async (client) => {
      if (coupleId) {
        assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
        await ensureActiveCoupleMember(client, coupleId, current.user.id);
      }
      const result = await client.query(
        `
          insert into public.app_feedback (user_id, couple_id, body, metadata)
          values ($1, $2, $3, $4::jsonb)
          returning *
        `,
        [current.user.id, coupleId, body, JSON.stringify(metadata)],
      );
      return publicFeedback(result.rows[0]);
    });
    return { feedback };
  }

  async function submitReport(input, current) {
    const reason = trimmedText(input.reason, 1000, "report_reason_required", "Report reason is required.");
    const details = optionalText(input.details, 2000);
    const coupleId = String(input.coupleId || input.couple_id || "");
    const reportedUserId = String(input.reportedUserId || input.reported_user_id || "");
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    assertUuid(reportedUserId, "invalid_reported_user_id", "A valid reported user id is required.");
    if (reportedUserId === current.user.id) {
      throw new AuthError("invalid_reported_user_id", 400, "You cannot report yourself.");
    }

    const report = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const partnerId = await activePartnerId(client, coupleId, current.user.id);
      if (partnerId !== reportedUserId) {
        throw new AuthError("forbidden", 403, "You can only report your current partner.");
      }
      const result = await client.query(
        `
          insert into public.reports (couple_id, reporter_id, reported_user_id, reason, details)
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [coupleId, current.user.id, reportedUserId, reason, details],
      );
      return publicReport(result.rows[0]);
    });
    return { report };
  }

  async function endActiveCouple(current) {
    const couple = await withTransaction(pool, async (client) => {
      const active = await findActiveCoupleForUpdate(client, current.user.id);
      if (!active) {
        throw new AuthError("active_couple_not_found", 404, "Active couple was not found.");
      }
      return publicEndedCouple(await endCoupleRows(client, active.id));
    });
    return { couple };
  }

  async function blockPartnerAndEndCouple(input, current) {
    const reason = optionalText(input.reason, 1000);
    const result = await withTransaction(pool, async (client) => {
      const active = await findActiveCoupleForUpdate(client, current.user.id);
      if (!active) {
        throw new AuthError("active_partner_not_found", 404, "Active partner was not found.");
      }
      const partnerId = await activePartnerId(client, active.id, current.user.id);
      if (!partnerId) {
        throw new AuthError("active_partner_not_found", 404, "Active partner was not found.");
      }
      const blockResult = await client.query(
        `
          insert into public.blocks (blocker_id, blocked_user_id, couple_id, reason)
          values ($1, $2, $3, $4)
          on conflict (blocker_id, blocked_user_id) do update
             set reason = excluded.reason,
                 couple_id = excluded.couple_id,
                 created_at = now()
          returning *
        `,
        [current.user.id, partnerId, active.id, reason],
      );
      const couple = await endCoupleRows(client, active.id);
      return {
        block: publicBlock(blockResult.rows[0]),
        couple: publicEndedCouple(couple),
      };
    });
    return result;
  }

  async function requestAccountDeletion(input, current) {
    const reason = optionalText(input.reason, 1000);
    const result = await withTransaction(pool, async (client) => {
      const active = await findActiveCoupleForUpdate(client, current.user.id);
      let endedCouple = null;
      if (active) {
        endedCouple = await endCoupleRows(client, active.id);
      }
      const requestResult = await client.query(
        `
          insert into public.account_deletion_requests (user_id, reason)
          values ($1, $2)
          on conflict (user_id, status) do update
             set reason = excluded.reason,
                 requested_at = now()
          returning *
        `,
        [current.user.id, reason],
      );
      const profileResult = await client.query(
        `
          update public.profiles
             set account_status = 'deletion_requested',
                 deletion_requested_at = coalesce(deletion_requested_at, now()),
                 updated_at = now()
           where id = $1
          returning id, account_status, deletion_requested_at
        `,
        [current.user.id],
      );
      await client.query(
        `
          update public.push_tokens
             set enabled = false,
                 revoked_at = coalesce(revoked_at, now())
           where user_id = $1
             and enabled = true
        `,
        [current.user.id],
      );
      await client.query(
        `
          update app_auth.refresh_sessions
             set status = 'revoked',
                 revoked_at = coalesce(revoked_at, now())
           where user_id = $1
             and status = 'active'
        `,
        [current.user.id],
      );
      await client.query(
        `
          update app_auth.accounts
             set disabled_at = coalesce(disabled_at, now()),
                 disabled_reason = 'account_deletion_requested',
                 updated_at = now()
           where id = $1
        `,
        [current.user.id],
      );
      return {
        deletionRequest: publicDeletionRequest(requestResult.rows[0]),
        profile: profileResult.rows[0],
        couple: endedCouple ? publicEndedCouple(endedCouple) : null,
      };
    });
    return result;
  }

  return {
    blockPartnerAndEndCouple,
    endActiveCouple,
    requestAccountDeletion,
    submitFeedback,
    submitReport,
  };
}
