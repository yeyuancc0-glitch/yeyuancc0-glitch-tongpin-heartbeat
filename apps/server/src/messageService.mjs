import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const defaultMessageListLimit = 1000;
const maxMessageListLimit = 5000;

const messageSelect = `
  select
    m.*,
    p.display_name as sender_display_name,
    p.avatar_storage_path as sender_avatar_storage_path,
    p.avatar_thumbnail_storage_path as sender_avatar_thumbnail_storage_path,
    p.birthday as sender_birthday,
    p.created_at as sender_profile_created_at,
    p.updated_at as sender_profile_updated_at
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
`;

function assertUuid(value, code, message) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

function publicProfile(row) {
  return {
    id: row.sender_id,
    displayName: row.sender_display_name,
    avatarStoragePath: row.sender_avatar_storage_path,
    avatarThumbnailStoragePath: row.sender_avatar_thumbnail_storage_path,
    birthday: row.sender_birthday,
    createdAt: row.sender_profile_created_at ?? row.created_at,
    updatedAt: row.sender_profile_updated_at ?? row.updated_at,
  };
}

function publicMessage(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    sender: publicProfile(row),
  };
}

export function createMessageService({ notificationService, pool }) {
  async function listMessages(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultMessageListLimit), 1), maxMessageListLimit);
    const result = await pool.query(
      `
        ${messageSelect}
        where m.couple_id = $1
          and m.deleted_at is null
          and public.is_active_couple_member(m.couple_id, $2)
        order by m.created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { messages: result.rows.map(publicMessage) };
  }

  async function createMessage(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const body = String(input.body || "").trim();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!body || body.length > 2000) {
      throw new AuthError("invalid_message_body", 400, "Message body must be between 1 and 2000 characters.");
    }

    const message = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const inserted = await client.query(
        `
          insert into public.messages (couple_id, sender_id, body)
          values ($1, $2, $3)
          returning id
        `,
        [coupleId, current.user.id, body],
      );
      const result = await client.query(`${messageSelect} where m.id = $1`, [inserted.rows[0].id]);
      return publicMessage(result.rows[0]);
    });

    await notificationService?.tryCreatePartnerNotification(pool, {
      coupleId,
      type: "message",
      title: "TA 留下了一条留言",
      body: "打开同频跳动查看新的留言。",
      relatedTable: "messages",
      relatedId: message.id,
    }, current);

    return { message };
  }

  async function deleteMessage(input, current) {
    const messageId = String(input.messageId || "");
    assertUuid(messageId, "invalid_message_id", "A valid message id is required.");

    const message = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.messages
          where id = $1
          for update
        `,
        [messageId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("message_not_found", 404, "Message was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.sender_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the sender can delete this message.");
      }
      await client.query(
        `
          update public.messages
             set deleted_at = coalesce(deleted_at, now())
           where id = $1
        `,
        [messageId],
      );
      const result = await client.query(`${messageSelect} where m.id = $1`, [messageId]);
      return publicMessage(result.rows[0]);
    });

    return { message };
  }

  return {
    createMessage,
    deleteMessage,
    listMessages,
  };
}
