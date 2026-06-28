import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const defaultLetterListLimit = 1000;
const maxLetterListLimit = 5000;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const letterSelect = `
  select
    fl.*,
    p.display_name as author_display_name
  from public.future_letters fl
  left join public.profiles p on p.id = fl.author_id
`;

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new AuthError("invalid_unlock_at", 400, "A valid unlock time is required.");
  }
  return date;
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

async function activePartnerId(client, coupleId, currentUserId) {
  const result = await client.query(
    `
      select user_id
      from public.couple_members
      where couple_id = $1
        and status = 'active'
        and user_id <> $2
      order by joined_at asc
      limit 1
      for update
    `,
    [coupleId, currentUserId],
  );
  return result.rows[0]?.user_id ?? null;
}

function publicLetter(row, currentUserId) {
  const unlockTime = new Date(row.unlock_at).getTime();
  const lockedForRecipient = row.author_id !== currentUserId && unlockTime > Date.now();
  return {
    id: row.id,
    coupleId: row.couple_id,
    authorId: row.author_id,
    recipientId: row.recipient_id,
    authorDisplayName: row.author_display_name,
    title: row.title,
    body: lockedForRecipient ? null : row.body,
    deliverAt: row.unlock_at,
    unlockAt: row.unlock_at,
    isLocked: lockedForRecipient,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function createLetterService({ notificationService, pool }) {
  async function listLetters(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultLetterListLimit), 1), maxLetterListLimit);
    const result = await pool.query(
      `
        ${letterSelect}
        where fl.couple_id = $1
          and fl.deleted_at is null
          and fl.recipient_id is not null
          and (fl.author_id = $2 or fl.recipient_id = $2)
          and public.is_active_couple_member(fl.couple_id, $2)
        order by fl.unlock_at desc, fl.created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { letters: result.rows.map((row) => publicLetter(row, current.user.id)) };
  }

  async function createLetter(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const title = String(input.title || "").trim() || "一封写给你的信";
    const body = String(input.body || "").trim();
    const unlockAt = safeDate(input.unlockAt || input.unlock_at);
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!body || body.length > 10000) {
      throw new AuthError("invalid_letter_body", 400, "Letter body must be between 1 and 10000 characters.");
    }
    if (title.length > 80) {
      throw new AuthError("invalid_letter_title", 400, "Letter title must be at most 80 characters.");
    }

    const letter = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const recipientId = input.recipientId || input.recipient_id || await activePartnerId(client, coupleId, current.user.id);
      assertUuid(recipientId, "invalid_recipient_id", "A valid recipient id is required.");
      if (recipientId === current.user.id) {
        throw new AuthError("invalid_recipient_id", 400, "Recipient must be your partner.");
      }
      await ensureActiveCoupleMember(client, coupleId, recipientId);
      const inserted = await client.query(
        `
          insert into public.future_letters (couple_id, author_id, recipient_id, title, body, unlock_at)
          values ($1, $2, $3, $4, $5, $6)
          returning id
        `,
        [coupleId, current.user.id, recipientId, title.slice(0, 80), body, unlockAt.toISOString()],
      );
      const result = await client.query(`${letterSelect} where fl.id = $1`, [inserted.rows[0].id]);
      return publicLetter(result.rows[0], current.user.id);
    });

    const nearImmediate = unlockAt.getTime() <= Date.now() + 30_000;
    await notificationService?.tryCreatePartnerNotification(pool, {
      coupleId,
      type: "letter",
      title: nearImmediate ? "你收到了一封信" : "一封信已经寄到未来",
      body: nearImmediate ? "现在就可以打开。" : "到约定时间再打开。",
      relatedTable: "future_letters",
      relatedId: letter.id,
    }, current);

    return { letter };
  }

  async function markRead(input, current) {
    const letterId = String(input.letterId || input.letter_id || "");
    assertUuid(letterId, "invalid_letter_id", "A valid letter id is required.");
    const letter = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.future_letters
          where id = $1
          for update
        `,
        [letterId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("letter_not_found", 404, "Letter was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.recipient_id !== current.user.id || new Date(row.unlock_at).getTime() > Date.now()) {
        throw new AuthError("letter_not_readable", 403, "Letter is not readable yet.");
      }
      await client.query("update public.future_letters set read_at = coalesce(read_at, now()) where id = $1", [letterId]);
      const result = await client.query(`${letterSelect} where fl.id = $1`, [letterId]);
      return publicLetter(result.rows[0], current.user.id);
    });
    return { letter };
  }

  async function dismissLetter(input, current) {
    const letterId = String(input.letterId || input.letter_id || "");
    assertUuid(letterId, "invalid_letter_id", "A valid letter id is required.");
    const letter = await withTransaction(pool, async (client) => {
      const found = await client.query("select * from public.future_letters where id = $1 for update", [letterId]);
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("letter_not_found", 404, "Letter was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.recipient_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the recipient can dismiss this letter.");
      }
      await client.query("update public.future_letters set dismissed_at = coalesce(dismissed_at, now()) where id = $1", [letterId]);
      const result = await client.query(`${letterSelect} where fl.id = $1`, [letterId]);
      return publicLetter(result.rows[0], current.user.id);
    });
    return { letter };
  }

  async function deleteLetter(input, current) {
    const letterId = String(input.letterId || input.letter_id || "");
    assertUuid(letterId, "invalid_letter_id", "A valid letter id is required.");
    const letter = await withTransaction(pool, async (client) => {
      const found = await client.query("select * from public.future_letters where id = $1 for update", [letterId]);
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("letter_not_found", 404, "Letter was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.author_id === current.user.id) {
        await client.query("update public.future_letters set deleted_at = coalesce(deleted_at, now()) where id = $1", [letterId]);
      } else if (row.recipient_id === current.user.id) {
        await client.query("update public.future_letters set dismissed_at = coalesce(dismissed_at, now()) where id = $1", [letterId]);
      } else {
        throw new AuthError("forbidden", 403, "You cannot delete this letter.");
      }
      const result = await client.query(`${letterSelect} where fl.id = $1`, [letterId]);
      return publicLetter(result.rows[0], current.user.id);
    });
    return { letter };
  }

  return {
    createLetter,
    deleteLetter,
    dismissLetter,
    listLetters,
    markRead,
  };
}
