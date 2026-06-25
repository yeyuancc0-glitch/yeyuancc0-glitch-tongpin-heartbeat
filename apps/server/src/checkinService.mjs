import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxCheckinListLimit = 5000;

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function assertDate(value, code, message) {
  if (!datePattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

function publicCheckin(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    userId: row.user_id,
    checkinDate: dateKey(row.checkin_date),
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function dateKey(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || "").slice(0, 10);
}

function publicMoodStatus(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    userId: row.user_id,
    mood: row.mood,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCheckinService({ notificationService, pool }) {
  async function listCheckins(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || maxCheckinListLimit), 1), maxCheckinListLimit);
    const result = await pool.query(
      `
        select *
        from public.checkins
        where couple_id = $1
          and deleted_at is null
          and public.is_active_couple_member(couple_id, $2)
        order by checkin_date desc, created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { checkins: result.rows.map(publicCheckin) };
  }

  async function upsertCheckin(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const checkinDate = String(input.checkinDate || input.checkin_date || "").trim();
    const content = typeof input.content === "string" && input.content.trim() ? input.content.trim() : null;
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    assertDate(checkinDate, "invalid_checkin_date", "A valid checkin date is required.");
    if (content && content.length > 2000) {
      throw new AuthError("invalid_checkin_content", 400, "Checkin content must be at most 2000 characters.");
    }

    const checkin = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.checkins (couple_id, user_id, checkin_date, content)
          values ($1, $2, $3::date, $4)
          on conflict (couple_id, user_id, checkin_date)
          where deleted_at is null
          do update set
            content = excluded.content,
            updated_at = now()
          returning *
        `,
        [coupleId, current.user.id, checkinDate, content],
      );
      return publicCheckin(result.rows[0]);
    });

    await notificationService?.tryCreatePartnerNotification(pool, {
      coupleId,
      type: "checkin",
      title: "TA 存下了一颗今日胶囊",
      body: "打开同频跳动查看新的今日胶囊。",
      relatedTable: "checkins",
      relatedId: checkin.id,
    }, current);

    return { checkin };
  }

  async function deleteCheckin(input, current) {
    const checkinId = String(input.checkinId || input.id || "");
    assertUuid(checkinId, "invalid_checkin_id", "A valid checkin id is required.");

    const checkin = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.checkins
          where id = $1
          for update
        `,
        [checkinId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("checkin_not_found", 404, "Checkin was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.user_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the author can delete this checkin.");
      }
      const updated = await client.query(
        `
          update public.checkins
             set deleted_at = coalesce(deleted_at, now())
           where id = $1
          returning *
        `,
        [checkinId],
      );
      return publicCheckin(updated.rows[0]);
    });

    return { checkin };
  }

  async function listMoodStatuses(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const result = await pool.query(
      `
        select *
        from public.mood_status
        where couple_id = $1
          and public.is_active_couple_member(couple_id, $2)
        order by updated_at desc
      `,
      [coupleId, current.user.id],
    );
    return { moodStatuses: result.rows.map(publicMoodStatus) };
  }

  async function upsertMoodStatus(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const mood = String(input.mood || "").trim();
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!mood || mood.length > 40) {
      throw new AuthError("invalid_mood", 400, "Mood must be between 1 and 40 characters.");
    }
    if (note && note.length > 500) {
      throw new AuthError("invalid_mood_note", 400, "Mood note must be at most 500 characters.");
    }

    const moodStatus = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.mood_status (couple_id, user_id, mood, note)
          values ($1, $2, $3, $4)
          on conflict (couple_id, user_id)
          do update set
            mood = excluded.mood,
            note = excluded.note,
            updated_at = now()
          returning *
        `,
        [coupleId, current.user.id, mood, note],
      );
      return publicMoodStatus(result.rows[0]);
    });

    return { moodStatus };
  }

  return {
    deleteCheckin,
    listCheckins,
    listMoodStatuses,
    upsertCheckin,
    upsertMoodStatus,
  };
}
