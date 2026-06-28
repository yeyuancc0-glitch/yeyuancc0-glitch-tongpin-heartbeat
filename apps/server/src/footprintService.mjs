import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const defaultFootprintListLimit = 1000;
const maxFootprintListLimit = 5000;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

function normalizeCoordinate(value, code, message) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new AuthError(code, 400, message);
  }
  return numericValue;
}

function assertCoordinatePair(latitude, longitude) {
  if ((latitude === null) !== (longitude === null)) {
    throw new AuthError("invalid_footprint_coordinates", 400, "Latitude and longitude must be provided together.");
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new AuthError("invalid_footprint_latitude", 400, "Latitude must be between -90 and 90.");
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new AuthError("invalid_footprint_longitude", 400, "Longitude must be between -180 and 180.");
  }
}

function dateKey(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || "").slice(0, 10);
}

function numericOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function publicFootprint(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    createdBy: row.created_by,
    title: row.title,
    note: row.note,
    latitude: numericOrNull(row.latitude),
    longitude: numericOrNull(row.longitude),
    visitedAt: dateKey(row.visited_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function createFootprintService({ pool }) {
  async function listFootprints(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultFootprintListLimit), 1), maxFootprintListLimit);
    const result = await pool.query(
      `
        select *
        from public.couple_footprints
        where couple_id = $1
          and deleted_at is null
          and public.is_active_couple_member(couple_id, $2)
        order by visited_at desc, created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { footprints: result.rows.map(publicFootprint) };
  }

  async function createFootprint(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const title = String(input.title || "").trim();
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    const visitedAt = String(input.visitedAt || input.visited_at || "").trim();
    const latitude = normalizeCoordinate(input.latitude, "invalid_footprint_latitude", "Latitude must be a number.");
    const longitude = normalizeCoordinate(input.longitude, "invalid_footprint_longitude", "Longitude must be a number.");

    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    assertDate(visitedAt, "invalid_visited_at", "A valid visited date is required.");
    if (!title || title.length > 120) {
      throw new AuthError("invalid_footprint_title", 400, "Footprint title must be between 1 and 120 characters.");
    }
    if (note && note.length > 1000) {
      throw new AuthError("invalid_footprint_note", 400, "Footprint note must be at most 1000 characters.");
    }
    assertCoordinatePair(latitude, longitude);

    const footprint = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.couple_footprints (couple_id, created_by, title, note, latitude, longitude, visited_at)
          values ($1, $2, $3, $4, $5, $6, $7::date)
          returning *
        `,
        [coupleId, current.user.id, title, note, latitude, longitude, visitedAt],
      );
      return publicFootprint(result.rows[0]);
    });

    return { footprint };
  }

  async function updateFootprint(input, current) {
    const footprintId = String(input.footprintId || input.id || "");
    assertUuid(footprintId, "invalid_footprint_id", "A valid footprint id is required.");

    const hasTitle = Object.hasOwn(input, "title");
    const hasNote = Object.hasOwn(input, "note");
    const hasVisitedAt = Object.hasOwn(input, "visitedAt") || Object.hasOwn(input, "visited_at");
    const hasLatitude = Object.hasOwn(input, "latitude");
    const hasLongitude = Object.hasOwn(input, "longitude");
    if (!hasTitle && !hasNote && !hasVisitedAt && !hasLatitude && !hasLongitude) {
      throw new AuthError("empty_footprint_update", 400, "No footprint fields were provided.");
    }

    const title = hasTitle ? String(input.title || "").trim() : undefined;
    const note = hasNote && typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    const visitedAt = hasVisitedAt ? String(input.visitedAt || input.visited_at || "").trim() : undefined;
    const latitude = hasLatitude ? normalizeCoordinate(input.latitude, "invalid_footprint_latitude", "Latitude must be a number.") : undefined;
    const longitude = hasLongitude ? normalizeCoordinate(input.longitude, "invalid_footprint_longitude", "Longitude must be a number.") : undefined;
    if (hasTitle && (!title || title.length > 120)) {
      throw new AuthError("invalid_footprint_title", 400, "Footprint title must be between 1 and 120 characters.");
    }
    if (hasNote && note && note.length > 1000) {
      throw new AuthError("invalid_footprint_note", 400, "Footprint note must be at most 1000 characters.");
    }
    if (hasVisitedAt) {
      assertDate(visitedAt, "invalid_visited_at", "A valid visited date is required.");
    }
    const footprint = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.couple_footprints
          where id = $1
          for update
        `,
        [footprintId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("footprint_not_found", 404, "Footprint was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.created_by !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the creator can update this footprint.");
      }
      if (hasLatitude || hasLongitude) {
        const nextLatitude = hasLatitude ? latitude : numericOrNull(row.latitude);
        const nextLongitude = hasLongitude ? longitude : numericOrNull(row.longitude);
        assertCoordinatePair(nextLatitude, nextLongitude);
      }
      const result = await client.query(
        `
          update public.couple_footprints
             set title = coalesce($2, title),
                 note = case when $3 then $4 else note end,
                 visited_at = coalesce($5::date, visited_at),
                 latitude = case when $6 then $7 else latitude end,
                 longitude = case when $8 then $9 else longitude end
           where id = $1
          returning *
        `,
        [footprintId, title ?? null, hasNote, note, visitedAt ?? null, hasLatitude, latitude ?? null, hasLongitude, longitude ?? null],
      );
      return publicFootprint(result.rows[0]);
    });

    return { footprint };
  }

  async function deleteFootprint(input, current) {
    const footprintId = String(input.footprintId || input.id || "");
    assertUuid(footprintId, "invalid_footprint_id", "A valid footprint id is required.");

    const footprint = await withTransaction(pool, async (client) => {
      const found = await client.query(
        `
          select *
          from public.couple_footprints
          where id = $1
          for update
        `,
        [footprintId],
      );
      const row = found.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("footprint_not_found", 404, "Footprint was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.created_by !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the creator can delete this footprint.");
      }
      const updated = await client.query(
        `
          update public.couple_footprints
             set deleted_at = coalesce(deleted_at, now())
           where id = $1
          returning *
        `,
        [footprintId],
      );
      return publicFootprint(updated.rows[0]);
    });

    return { footprint };
  }

  return {
    createFootprint,
    deleteFootprint,
    listFootprints,
    updateFootprint,
  };
}
