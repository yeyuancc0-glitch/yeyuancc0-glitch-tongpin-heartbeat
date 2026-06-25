import { randomInt } from "node:crypto";

import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function inviteCode() {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
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

function publicCouple(row) {
  return {
    id: row.id,
    relationshipStartedAt: dateKey(row.relationship_started_at),
    createdAt: row.created_at,
  };
}

function publicInvite(row) {
  return {
    id: row.id,
    inviteCode: row.invite_code,
    inviterUserId: row.inviter_user_id,
    acceptedByUserId: row.accepted_by_user_id,
    coupleId: row.couple_id,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  };
}

function relationshipStartedAtInput(input) {
  const value = input.relationshipStartedAt ?? input.relationship_started_at ?? null;
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (!datePattern.test(String(value))) {
    throw new AuthError("invalid_relationship_started_at", 400, "Relationship start date must be a valid date.");
  }
  return String(value);
}

export function createRelationshipService({ pool }) {
  async function activeCouple(current) {
    const result = await pool.query(
      `
        select c.*
        from public.couples c
        join public.couple_members cm on cm.couple_id = c.id
        where cm.user_id = $1
          and cm.status = 'active'
          and c.status = 'active'
        limit 1
      `,
      [current.user.id],
    );
    return {
      couple: result.rows[0] ? publicCouple(result.rows[0]) : null,
    };
  }

  async function createInvite(current) {
    return withTransaction(pool, async (client) => {
      const active = await client.query(
        `
          select 1
          from public.couple_members
          where user_id = $1
            and status = 'active'
          limit 1
          for update
        `,
        [current.user.id],
      );
      if (active.rows.length > 0) {
        throw new AuthError("active_couple_exists", 409, "User already has an active couple.");
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const result = await client.query(
            `
              insert into public.pair_invites (invite_code, inviter_user_id, expires_at)
              values ($1, $2, now() + interval '24 hours')
              returning *
            `,
            [inviteCode(), current.user.id],
          );
          return { invite: publicInvite(result.rows[0]) };
        } catch (error) {
          if (error?.code !== "23505") {
            throw error;
          }
        }
      }
      throw new AuthError("invite_code_collision", 500, "Could not create invite.");
    });
  }

  async function listPendingInvites(current) {
    const result = await pool.query(
      `
        select *
        from public.pair_invites
        where inviter_user_id = $1
          and status = 'pending'
          and expires_at > now()
        order by created_at desc
        limit 5
      `,
      [current.user.id],
    );
    return {
      invites: result.rows.map(publicInvite),
    };
  }

  async function acceptInvite(input, current) {
    const code = String(input.inviteCode || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{6,16}$/.test(code)) {
      throw new AuthError("invalid_invite_code", 400, "Invite code is invalid.");
    }
    const startedAt = relationshipStartedAtInput(input);
    const result = await pool.query(
      `
        with accepted as (
          select public.accept_pair_invite($1, $2, $3::date) as couple_id
        )
        select c.*
        from public.couples c
        join accepted on accepted.couple_id = c.id
      `,
      [code, current.user.id, startedAt],
    );
    return {
      couple: publicCouple(result.rows[0]),
    };
  }

  return {
    acceptInvite,
    activeCouple,
    createInvite,
    listPendingInvites,
  };
}
