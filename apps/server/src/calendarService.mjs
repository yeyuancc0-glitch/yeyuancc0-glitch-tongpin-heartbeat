import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedTypes = new Set(["anniversary", "date", "todo", "other"]);

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

function normalizedType(value) {
  const nextType = String(value || "other").trim();
  if (!allowedTypes.has(nextType)) {
    throw new AuthError("invalid_event_type", 400, "Calendar event type is invalid.");
  }
  return nextType;
}

function publicCalendarEvent(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    createdBy: row.created_by,
    title: row.title,
    eventDate: dateKey(row.event_date),
    type: row.type,
    note: row.note,
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

export function createCalendarService({ notificationService, pool }) {
  async function listEvents(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || 60), 1), 200);
    const result = await pool.query(
      `
        select *
        from public.calendar_events
        where couple_id = $1
          and deleted_at is null
          and public.is_active_couple_member(couple_id, $2)
        order by event_date asc, created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { events: result.rows.map(publicCalendarEvent) };
  }

  async function createEvent(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const title = String(input.title || "").trim();
    const eventDate = String(input.eventDate || input.event_date || "").trim();
    const type = normalizedType(input.type);
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    const remind = Boolean(input.remind);

    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    assertDate(eventDate, "invalid_event_date", "A valid event date is required.");
    if (!title || title.length > 120) {
      throw new AuthError("invalid_event_title", 400, "Calendar event title must be between 1 and 120 characters.");
    }
    if (note && note.length > 1000) {
      throw new AuthError("invalid_event_note", 400, "Calendar event note must be at most 1000 characters.");
    }

    const event = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.calendar_events (couple_id, created_by, title, event_date, type, note)
          values ($1, $2, $3, $4::date, $5, $6)
          returning *
        `,
        [coupleId, current.user.id, title, eventDate, type, note],
      );
      return publicCalendarEvent(result.rows[0]);
    });

    if (remind) {
      await notificationService?.tryCreatePartnerNotification(pool, {
        coupleId,
        type: "calendar_event",
        title: "新的记忆事件已保存",
        body: type === "anniversary" ? "TA 保存了一个纪念日。" : "TA 保存了一条新的记忆。",
        relatedTable: "calendar_events",
        relatedId: event.id,
      }, current);
    }

    return { event };
  }

  async function updateEvent(input, current) {
    const eventId = String(input.eventId || input.id || "");
    assertUuid(eventId, "invalid_event_id", "A valid event id is required.");

    const hasTitle = Object.hasOwn(input, "title");
    const hasEventDate = Object.hasOwn(input, "eventDate") || Object.hasOwn(input, "event_date");
    const hasType = Object.hasOwn(input, "type");
    const hasNote = Object.hasOwn(input, "note");
    if (!hasTitle && !hasEventDate && !hasType && !hasNote) {
      throw new AuthError("empty_event_update", 400, "No calendar event fields were provided.");
    }

    const title = hasTitle ? String(input.title || "").trim() : undefined;
    const eventDate = hasEventDate ? String(input.eventDate || input.event_date || "").trim() : undefined;
    const type = hasType ? normalizedType(input.type) : undefined;
    const note = hasNote && typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    if (hasTitle && (!title || title.length > 120)) {
      throw new AuthError("invalid_event_title", 400, "Calendar event title must be between 1 and 120 characters.");
    }
    if (hasEventDate) {
      assertDate(eventDate, "invalid_event_date", "A valid event date is required.");
    }
    if (note && note.length > 1000) {
      throw new AuthError("invalid_event_note", 400, "Calendar event note must be at most 1000 characters.");
    }

    const event = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.calendar_events
          where id = $1
          for update
        `,
        [eventId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("event_not_found", 404, "Calendar event was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      const result = await client.query(
        `
          update public.calendar_events
             set title = coalesce($2, title),
                 event_date = coalesce($3::date, event_date),
                 type = coalesce($4, type),
                 note = case when $5 then $6 else note end
           where id = $1
          returning *
        `,
        [eventId, title ?? null, eventDate ?? null, type ?? null, hasNote, note],
      );
      return publicCalendarEvent(result.rows[0]);
    });

    return { event };
  }

  async function deleteEvent(input, current) {
    const eventId = String(input.eventId || input.id || "");
    assertUuid(eventId, "invalid_event_id", "A valid event id is required.");

    const event = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.calendar_events
          where id = $1
          for update
        `,
        [eventId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("event_not_found", 404, "Calendar event was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      const updated = await client.query(
        `
          update public.calendar_events
             set deleted_at = coalesce(deleted_at, now())
           where id = $1
          returning *
        `,
        [eventId],
      );
      return publicCalendarEvent(updated.rows[0]);
    });

    return { event };
  }

  return {
    createEvent,
    deleteEvent,
    listEvents,
    updateEvent,
  };
}
