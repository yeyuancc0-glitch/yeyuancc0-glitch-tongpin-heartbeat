import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertDateOrNull(value, code, message) {
  if (value !== null && value !== undefined && value !== "" && !datePattern.test(String(value))) {
    throw new AuthError(code, 400, message);
  }
}

function trimmedNullable(value, maxLength, code, message) {
  if (value === null || value === undefined) {
    return null;
  }
  const nextValue = String(value).trim();
  if (!nextValue) {
    return null;
  }
  if (nextValue.length > maxLength) {
    throw new AuthError(code, 400, message);
  }
  return nextValue;
}

function assertOwnedStoragePath(value, userId, code, message) {
  if (value === null || value === undefined) {
    return;
  }
  if (!String(value).startsWith(`${userId}/`)) {
    throw new AuthError(code, 403, message);
  }
}

function dateKey(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function publicProfile(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    displayName: row.display_name,
    avatarStoragePath: row.avatar_storage_path,
    avatarThumbnailStoragePath: row.avatar_thumbnail_storage_path,
    birthday: dateKey(row.birthday),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readOrCreateProfile(client, current) {
  const found = await client.query(
    `
      select *
      from public.profiles
      where id = $1
    `,
    [current.user.id],
  );
  if (found.rows[0]) {
    return publicProfile(found.rows[0]);
  }

  const fallbackDisplayName = trimmedNullable(current.user.profile?.displayName, 80, "invalid_display_name", "Display name must be at most 80 characters.");
  try {
    const created = await client.query(
      `
        insert into public.profiles (id, display_name)
        select id, $2
        from app_auth.accounts
        where id = $1
          and disabled_at is null
        returning *
      `,
      [current.user.id, fallbackDisplayName],
    );
    if (!created.rows[0]) {
      throw new AuthError("profile_account_missing", 401, "Authentication is required for this endpoint.");
    }
    return publicProfile(created.rows[0]);
  } catch (error) {
    if (error?.code !== "23505") {
      throw error;
    }
    const retry = await client.query(
      `
        select *
        from public.profiles
        where id = $1
      `,
      [current.user.id],
    );
    return publicProfile(retry.rows[0]);
  }
}

function publicActiveCouple(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    relationshipStartedAt: dateKey(row.relationship_started_at),
    createdAt: row.created_at,
    endedAt: row.ended_at,
    status: row.status,
  };
}

export function createProfileService({ pool }) {
  async function getProfile(current) {
    const profile = await withTransaction(pool, (client) => readOrCreateProfile(client, current));
    const coupleResult = await pool.query(
      `
        select c.*
        from public.couples c
        join public.couple_members cm on cm.couple_id = c.id
        where cm.user_id = $1
          and cm.status = 'active'
          and c.status = 'active'
        order by c.created_at desc
        limit 1
      `,
      [current.user.id],
    );
    return {
      profile,
      activeCouple: publicActiveCouple(coupleResult.rows[0]),
    };
  }

  async function updateProfile(input, current) {
    const displayName = trimmedNullable(input.displayName ?? input.display_name, 80, "invalid_display_name", "Display name must be at most 80 characters.");
    const birthdayProvided = Object.hasOwn(input, "birthday") || Object.hasOwn(input, "birthdate");
    const birthday = birthdayProvided ? input.birthday ?? input.birthdate ?? null : undefined;
    const avatarStoragePath = Object.hasOwn(input, "avatarStoragePath") || Object.hasOwn(input, "avatar_storage_path")
      ? trimmedNullable(input.avatarStoragePath ?? input.avatar_storage_path, 512, "invalid_avatar_path", "Avatar path is too long.")
      : undefined;
    const avatarThumbnailStoragePath = Object.hasOwn(input, "avatarThumbnailStoragePath") || Object.hasOwn(input, "avatar_thumbnail_storage_path")
      ? trimmedNullable(input.avatarThumbnailStoragePath ?? input.avatar_thumbnail_storage_path, 512, "invalid_avatar_thumbnail_path", "Avatar thumbnail path is too long.")
      : undefined;
    assertDateOrNull(birthday, "invalid_birthday", "Birthday must be a valid date.");
    assertOwnedStoragePath(avatarStoragePath, current.user.id, "invalid_avatar_path", "Avatar path must belong to the current user.");
    assertOwnedStoragePath(avatarThumbnailStoragePath, current.user.id, "invalid_avatar_thumbnail_path", "Avatar thumbnail path must belong to the current user.");

    const profile = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          insert into public.profiles (
            id,
            display_name,
            birthday,
            avatar_storage_path,
            avatar_thumbnail_storage_path
          )
          select
            id,
            $2,
            case when $3 then $4::date else null end,
            case when $5 then $6 else null end,
            case when $7 then $8 else null end
          from app_auth.accounts
          where id = $1
            and disabled_at is null
          on conflict (id) do update set
            display_name = coalesce(excluded.display_name, public.profiles.display_name),
            birthday = case when $3 then excluded.birthday else public.profiles.birthday end,
            avatar_storage_path = case when $5 then excluded.avatar_storage_path else public.profiles.avatar_storage_path end,
            avatar_thumbnail_storage_path = case when $7 then excluded.avatar_thumbnail_storage_path else public.profiles.avatar_thumbnail_storage_path end,
            updated_at = now()
          returning *
        `,
        [
          current.user.id,
          displayName,
          birthdayProvided,
          birthday ? String(birthday) : null,
          avatarStoragePath !== undefined,
          avatarStoragePath ?? null,
          avatarThumbnailStoragePath !== undefined,
          avatarThumbnailStoragePath ?? null,
        ],
      );
      if (!result.rows[0]) {
        throw new AuthError("profile_account_missing", 401, "Authentication is required for this endpoint.");
      }
      return publicProfile(result.rows[0]);
    });

    return { profile };
  }

  async function updateActiveCoupleDates(input, current) {
    const relationshipStartedAt = input.relationshipStartedAt ?? input.relationship_started_at ?? null;
    assertDateOrNull(relationshipStartedAt, "invalid_relationship_started_at", "Relationship start date must be a valid date.");

    const couple = await withTransaction(pool, async (client) => {
      const found = await client.query(
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
        [current.user.id],
      );
      const row = found.rows[0];
      if (!row) {
        return null;
      }
      const updated = await client.query(
        `
          update public.couples
             set relationship_started_at = $2::date
           where id = $1
          returning *
        `,
        [row.id, relationshipStartedAt ? String(relationshipStartedAt) : null],
      );
      return publicActiveCouple(updated.rows[0]);
    });

    return { couple };
  }

  return {
    ensureProfile: (current) => withTransaction(pool, (client) => readOrCreateProfile(client, current)),
    getProfile,
    updateActiveCoupleDates,
    updateProfile,
  };
}
