import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function cleanInteractionLabel(value) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  if (!label) {
    throw new AuthError("interaction_label_required", 400, "Interaction label is required.");
  }
  return label.slice(0, 32);
}

async function usersAreBlocked(client, userA, userB) {
  const result = await client.query(
    `
      select 1
      from public.blocks
      where (blocker_id = $1 and blocked_user_id = $2)
         or (blocker_id = $2 and blocked_user_id = $1)
      limit 1
    `,
    [userA, userB],
  );
  return Boolean(result.rows[0]);
}

async function activePartnerId(client, coupleId, currentUserId) {
  const result = await client.query(
    `
      select cm.user_id
      from public.couple_members cm
      where cm.couple_id = $1
        and cm.user_id <> $2
        and cm.status = 'active'
      order by cm.joined_at asc
      limit 1
    `,
    [coupleId, currentUserId],
  );
  return result.rows[0]?.user_id ?? null;
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

export function createInteractionService({ notificationService, pool }) {
  async function sendQuickInteraction(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || input.targetCoupleId || input.target_couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const label = cleanInteractionLabel(input.label || input.interactionLabel || input.interaction_label);

    const notification = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const partnerId = await activePartnerId(client, coupleId, current.user.id);
      if (!partnerId) {
        throw new AuthError("partner_not_found", 404, "Active partner was not found.");
      }
      if (await usersAreBlocked(client, current.user.id, partnerId)) {
        throw new AuthError("partner_blocked", 403, "Partner is blocked.");
      }
      return notificationService.createPartnerNotification(client, {
        coupleId,
        type: "message",
        title: "TA 向你投递了一点心情",
        body: label,
      }, current);
    });

    return {
      notification,
      notificationId: notification.id,
      notification_id: notification.id,
    };
  }

  return {
    sendQuickInteraction,
  };
}
