import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actionTypes = new Set([
  "feed",
  "pet",
  "clean",
  "play",
  "sleep",
  "rename",
  "decorate",
  "choose_pet",
  "buy_food",
  "game_reward",
  "ai_brain",
  "memory_update",
  "footprint_add",
  "footprint_update",
  "footprint_delete",
]);
const memoryTypes = new Set(["preference", "care_summary", "event", "footprint", "online_together", "milestone"]);
const memoryScopes = new Set(["short", "core"]);
const foodTypes = new Set(["basic", "premium"]);
const interactionTypes = new Set(["pet", "clean", "play", "sleep"]);
const petWorldSurfaces = new Set(["home", "share", "memory", "creation_hub", "pet_room"]);
const sleepFullRecoverMs = 5 * 60 * 1000;
const sleepFullEnergy = 18;
const defaultCreationListLimit = 1000;
const maxCreationListLimit = 5000;

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function publicCreationSpace(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    coupleId: row.couple_id,
    petKey: row.pet_key,
    petSpecies: row.pet_species,
    petName: row.pet_name,
    petMood: row.pet_mood,
    petLevel: row.pet_level,
    growthPoints: row.growth_points,
    fullness: row.fullness,
    cleanliness: row.cleanliness,
    affection: row.affection,
    energy: row.energy,
    boredom: row.boredom,
    comfort: row.comfort,
    curiosity: row.curiosity,
    currentAction: row.current_action,
    personalitySeed: row.personality_seed,
    lastBrainTickAt: row.last_brain_tick_at,
    lastAiResponseAt: row.last_ai_response_at,
    lastAiBubble: row.last_ai_bubble,
    lastRigCue: row.last_rig_cue ?? {},
    treatBalance: row.treat_balance,
    basicFoodCount: row.basic_food_count,
    premiumFoodCount: row.premium_food_count,
    lastFedFood: row.last_fed_food,
    lastFedAt: row.last_fed_at,
    lastPlayedAt: row.last_played_at,
    homeTheme: row.home_theme,
    decorSlot1: row.decor_slot_1,
    decorSlot2: row.decor_slot_2,
    decorSlot3: row.decor_slot_3,
    lastInteractionAt: row.last_interaction_at,
    lastWorldDecision: row.last_world_decision ?? {},
    petWorldSurface: row.pet_world_surface,
    petWorldState: row.pet_world_state,
    petWorldMood: row.pet_world_mood,
    petHidden: row.pet_hidden,
    petLastSeenAt: row.pet_last_seen_at,
    petLastFoundAt: row.pet_last_found_at,
    petLastSurfaceChangedAt: row.pet_last_surface_changed_at,
    petSleepStartedAt: row.pet_sleep_started_at,
    petSleepRecoveredEnergy: row.pet_sleep_recovered_energy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicCreationAction(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    actorId: row.actor_id,
    actionType: row.action_type,
    actionLabel: row.action_label,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function publicPetMemory(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    memoryType: row.memory_type,
    memoryScope: row.memory_scope,
    importance: row.importance,
    summary: row.summary,
    metadata: row.metadata ?? {},
    expiresAt: row.expires_at,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const json = JSON.stringify(value);
  if (json.length > 2000) {
    throw new AuthError("metadata_too_large", 400, "Metadata must be at most 2000 characters.");
  }
  return value;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function settleSleep(row, { keepSleeping = false } = {}) {
  if (!row?.pet_sleep_started_at) {
    return { energy: row.energy, recovered: row.pet_sleep_recovered_energy ?? 0, sleepStartedAt: null };
  }
  const startedAt = new Date(row.pet_sleep_started_at).getTime();
  const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
  const recovered = Math.min(sleepFullEnergy, Math.floor((elapsedMs / sleepFullRecoverMs) * sleepFullEnergy));
  const shouldKeepSleeping = keepSleeping && elapsedMs < sleepFullRecoverMs;
  return {
    energy: shouldKeepSleeping ? row.energy : clamp(row.energy + recovered),
    recovered,
    sleepStartedAt: shouldKeepSleeping ? row.pet_sleep_started_at : null,
  };
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

async function findActiveCoupleId(client, userId) {
  const result = await client.query(
    `
      select c.id
      from public.couples c
      join public.couple_members cm on cm.couple_id = c.id
      where cm.user_id = $1
        and cm.status = 'active'
        and c.status = 'active'
      limit 1
    `,
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

async function ensureCreationSpaceRow(client, coupleId) {
  await client.query(
    `
      insert into public.creation_spaces (couple_id)
      values ($1)
      on conflict (couple_id) do nothing
    `,
    [coupleId],
  );
  const result = await client.query(
    `
      select *
      from public.creation_spaces
      where couple_id = $1
      for update
    `,
    [coupleId],
  );
  return result.rows[0] ?? null;
}

async function insertCreationAction(client, { coupleId, actorId, actionType, actionLabel, metadata = {} }) {
  const result = await client.query(
    `
      insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
      values ($1, $2, $3, $4, $5::jsonb)
      returning *
    `,
    [coupleId, actorId, actionType, actionLabel, JSON.stringify(metadata)],
  );
  return publicCreationAction(result.rows[0]);
}

async function updateCreationSpace(client, coupleId, patch) {
  const result = await client.query(
    `
      update public.creation_spaces
      set pet_mood = $2,
          growth_points = $3,
          fullness = $4,
          cleanliness = $5,
          affection = $6,
          energy = $7,
          boredom = $8,
          comfort = $9,
          curiosity = $10,
          current_action = $11,
          last_ai_bubble = $12,
          last_rig_cue = $13::jsonb,
          treat_balance = $14,
          basic_food_count = $15,
          premium_food_count = $16,
          last_fed_food = $17,
          last_fed_at = $18::timestamptz,
          last_played_at = $19::timestamptz,
          last_interaction_at = $20::timestamptz,
          pet_world_surface = $21,
          pet_world_state = $22,
          pet_world_mood = $23,
          pet_hidden = $24,
          pet_last_found_at = $25::timestamptz,
          pet_last_surface_changed_at = $26::timestamptz,
          pet_sleep_started_at = $27::timestamptz,
          pet_sleep_recovered_energy = $28
      where couple_id = $1
      returning *
    `,
    [
      coupleId,
      patch.pet_mood,
      patch.growth_points,
      patch.fullness,
      patch.cleanliness,
      patch.affection,
      patch.energy,
      patch.boredom,
      patch.comfort,
      patch.curiosity,
      patch.current_action,
      patch.last_ai_bubble,
      JSON.stringify(patch.last_rig_cue ?? {}),
      patch.treat_balance,
      patch.basic_food_count,
      patch.premium_food_count,
      patch.last_fed_food,
      patch.last_fed_at,
      patch.last_played_at,
      patch.last_interaction_at,
      patch.pet_world_surface,
      patch.pet_world_state,
      patch.pet_world_mood,
      patch.pet_hidden,
      patch.pet_last_found_at,
      patch.pet_last_surface_changed_at,
      patch.pet_sleep_started_at,
      patch.pet_sleep_recovered_energy,
    ],
  );
  return publicCreationSpace(result.rows[0]);
}

function mutableSpace(row) {
  return {
    pet_mood: row.pet_mood,
    growth_points: row.growth_points,
    fullness: row.fullness,
    cleanliness: row.cleanliness,
    affection: row.affection,
    energy: row.energy,
    boredom: row.boredom,
    comfort: row.comfort,
    curiosity: row.curiosity,
    current_action: row.current_action,
    last_ai_bubble: row.last_ai_bubble,
    last_rig_cue: row.last_rig_cue ?? {},
    treat_balance: row.treat_balance,
    basic_food_count: row.basic_food_count,
    premium_food_count: row.premium_food_count,
    last_fed_food: row.last_fed_food,
    last_fed_at: row.last_fed_at,
    last_played_at: row.last_played_at,
    last_interaction_at: row.last_interaction_at,
    pet_world_surface: row.pet_world_surface,
    pet_world_state: row.pet_world_state,
    pet_world_mood: row.pet_world_mood,
    pet_hidden: row.pet_hidden,
    pet_last_found_at: row.pet_last_found_at,
    pet_last_surface_changed_at: row.pet_last_surface_changed_at,
    pet_sleep_started_at: row.pet_sleep_started_at,
    pet_sleep_recovered_energy: row.pet_sleep_recovered_energy,
  };
}

export function createCreationService({ pool }) {
  async function ensureCreationSpace(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");

    const creationSpace = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          with inserted as (
            insert into public.creation_spaces (couple_id)
            values ($1)
            on conflict (couple_id) do nothing
            returning *
          )
          select *
          from inserted
          union all
          select *
          from public.creation_spaces
          where couple_id = $1
          limit 1
        `,
        [coupleId],
      );
      return publicCreationSpace(result.rows[0]);
    });

    return { creationSpace };
  }

  async function getActiveCreationSpace(current) {
    const client = await pool.connect();
    try {
      const coupleId = await findActiveCoupleId(client, current.user.id);
      if (!coupleId) {
        return { creationSpace: null };
      }
      return ensureCreationSpace({ coupleId }, current);
    } finally {
      client.release();
    }
  }

  async function listCreationActions(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultCreationListLimit), 1), maxCreationListLimit);
    const result = await pool.query(
      `
        select *
        from public.creation_actions
        where couple_id = $1
          and public.is_active_couple_member(couple_id, $2)
        order by created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { creationActions: result.rows.map(publicCreationAction) };
  }

  async function recordCreationAction(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const actionType = String(input.actionType || input.action_type || "").trim();
    const actionLabel = String(input.actionLabel || input.action_label || "").trim();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!actionTypes.has(actionType)) {
      throw new AuthError("invalid_creation_action_type", 400, "Creation action type is invalid.");
    }
    if (!actionLabel || actionLabel.length > 120) {
      throw new AuthError("invalid_creation_action_label", 400, "Creation action label must be between 1 and 120 characters.");
    }
    const metadata = safeMetadata(input.metadata);

    const creationAction = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      return insertCreationAction(client, { coupleId, actorId: current.user.id, actionType, actionLabel, metadata });
    });

    return { creationAction };
  }

  async function listPetMemories(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultCreationListLimit), 1), maxCreationListLimit);
    const result = await pool.query(
      `
        select *
        from public.pet_memories
        where couple_id = $1
          and archived_at is null
          and (memory_scope = 'core' or expires_at is null or expires_at > now())
          and public.is_active_couple_member(couple_id, $2)
        order by created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { petMemories: result.rows.map(publicPetMemory) };
  }

  async function createPetMemory(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const memoryType = String(input.memoryType || input.memory_type || "").trim();
    const memoryScope = String(input.memoryScope || input.memory_scope || "short").trim();
    const summary = String(input.summary || "").trim();
    const importance = Math.min(Math.max(Number(input.importance ?? 1), 0), 100);
    const expiresAt = input.expiresAt || input.expires_at || null;
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!memoryTypes.has(memoryType)) {
      throw new AuthError("invalid_pet_memory_type", 400, "Pet memory type is invalid.");
    }
    if (!memoryScopes.has(memoryScope)) {
      throw new AuthError("invalid_pet_memory_scope", 400, "Pet memory scope is invalid.");
    }
    if (!summary || summary.length > 240) {
      throw new AuthError("invalid_pet_memory_summary", 400, "Pet memory summary must be between 1 and 240 characters.");
    }
    const metadata = safeMetadata(input.metadata);

    const petMemory = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.pet_memories (couple_id, memory_type, memory_scope, importance, summary, metadata, expires_at, created_by)
          values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8)
          returning *
        `,
        [coupleId, memoryType, memoryScope, importance, summary, JSON.stringify(metadata), expiresAt, current.user.id],
      );
      return publicPetMemory(result.rows[0]);
    });

    return { petMemory };
  }

  async function feedPet(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const foodType = String(input.foodType || input.food_type || "").trim();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!foodTypes.has(foodType)) {
      throw new AuthError("invalid_food_type", 400, "Food type is invalid.");
    }

    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const countColumn = foodType === "premium" ? "premium_food_count" : "basic_food_count";
      if ((row[countColumn] ?? 0) <= 0) {
        throw new AuthError("creation_food_not_enough", 400, "Not enough food in the granary.");
      }
      const sleep = settleSleep(row);
      const now = new Date().toISOString();
      const patch = {
        ...mutableSpace(row),
        pet_mood: "happy",
        growth_points: row.growth_points + (foodType === "premium" ? 6 : 3),
        fullness: clamp(row.fullness + (foodType === "premium" ? 26 : 16)),
        cleanliness: clamp(row.cleanliness - (foodType === "premium" ? 2 : 1)),
        affection: clamp(row.affection + (foodType === "premium" ? 5 : 3)),
        energy: sleep.energy,
        boredom: clamp(row.boredom - 4),
        comfort: clamp(row.comfort + 4),
        curiosity: row.curiosity,
        current_action: "eat",
        last_ai_bubble: "吃到啦",
        treat_balance: row.treat_balance,
        basic_food_count: foodType === "basic" ? row.basic_food_count - 1 : row.basic_food_count,
        premium_food_count: foodType === "premium" ? row.premium_food_count - 1 : row.premium_food_count,
        last_fed_food: foodType,
        last_fed_at: now,
        last_interaction_at: now,
        pet_world_state: "eat",
        pet_world_mood: "happy",
        pet_hidden: false,
        pet_sleep_started_at: sleep.sleepStartedAt,
        pet_sleep_recovered_energy: sleep.recovered,
      };
      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      const creationAction = await insertCreationAction(client, {
        coupleId,
        actorId: current.user.id,
        actionType: "feed",
        actionLabel: `投喂了${foodType === "premium" ? "鲜食粮" : "日常粮"}`,
        metadata: { foodType },
      });
      return { creationSpace, creationAction };
    });

    return result;
  }

  async function interactPet(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const interactionType = String(input.interactionType || input.interaction_type || "").trim();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!interactionTypes.has(interactionType)) {
      throw new AuthError("invalid_interaction_type", 400, "Interaction type is invalid.");
    }

    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const now = new Date().toISOString();
      const sleep = interactionType === "sleep" ? { energy: row.energy, recovered: row.pet_sleep_recovered_energy ?? 0, sleepStartedAt: now } : settleSleep(row);
      const patch = mutableSpace(row);
      patch.energy = sleep.energy;
      patch.pet_sleep_started_at = sleep.sleepStartedAt;
      patch.pet_sleep_recovered_energy = sleep.recovered;
      patch.current_action = interactionType;
      patch.last_interaction_at = now;
      patch.pet_world_state = interactionType;
      patch.pet_hidden = false;

      if (interactionType === "pet") {
        patch.pet_mood = "happy";
        patch.pet_world_mood = "happy";
        patch.affection = clamp(row.affection + 8);
        patch.comfort = clamp(row.comfort + 4);
        patch.boredom = clamp(row.boredom - 4);
        patch.last_ai_bubble = "喜欢";
      } else if (interactionType === "clean") {
        patch.pet_mood = "calm";
        patch.pet_world_mood = "calm";
        patch.cleanliness = clamp(row.cleanliness + 24);
        patch.comfort = clamp(row.comfort + 5);
        patch.boredom = clamp(row.boredom - 2);
        patch.last_ai_bubble = "小窝干净啦";
      } else if (interactionType === "play") {
        patch.pet_mood = "excited";
        patch.pet_world_mood = "excited";
        patch.affection = clamp(row.affection + 5);
        patch.energy = clamp(sleep.energy - 8);
        patch.boredom = clamp(row.boredom - 18);
        patch.curiosity = clamp(row.curiosity + 6);
        patch.last_played_at = now;
        patch.last_ai_bubble = "再玩一会儿";
      } else if (interactionType === "sleep") {
        patch.pet_mood = "sleepy";
        patch.pet_world_mood = "sleepy";
        patch.current_action = "sleep";
        patch.pet_world_state = "sleep";
        patch.last_ai_bubble = "晚安";
      }

      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      const creationAction = await insertCreationAction(client, {
        coupleId,
        actorId: current.user.id,
        actionType: interactionType,
        actionLabel:
          interactionType === "clean" ? "清洁了小屋"
          : interactionType === "play" ? "陪云宠玩了一会儿"
          : interactionType === "sleep" ? "哄云宠休息"
          : "轻轻摸摸云宠",
        metadata: { interactionType },
      });
      return { creationSpace, creationAction };
    });

    return result;
  }

  async function settlePetSleep(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const sleep = settleSleep(row, { keepSleeping: true });
      const patch = {
        ...mutableSpace(row),
        energy: sleep.energy,
        current_action: sleep.sleepStartedAt ? "sleep" : "happy",
        last_interaction_at: new Date().toISOString(),
        pet_world_state: sleep.sleepStartedAt ? "sleep" : "happy",
        pet_world_mood: sleep.sleepStartedAt ? "sleepy" : "happy",
        pet_sleep_started_at: sleep.sleepStartedAt,
        pet_sleep_recovered_energy: sleep.recovered,
        last_ai_bubble: sleep.sleepStartedAt ? "还想再睡一会儿" : "睡醒啦",
      };
      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      return { creationSpace };
    });
    return result;
  }

  async function buyFood(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const foodType = String(input.foodType || input.food_type || "").trim();
    const quantity = Math.min(Math.max(Number(input.quantity || 1), 1), 10);
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!foodTypes.has(foodType)) {
      throw new AuthError("invalid_food_type", 400, "Food type is invalid.");
    }
    const price = foodType === "premium" ? 14 : 6;
    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const totalPrice = price * quantity;
      if (row.treat_balance < totalPrice) {
        throw new AuthError("creation_treat_not_enough", 400, "Not enough treats.");
      }
      const patch = {
        ...mutableSpace(row),
        treat_balance: row.treat_balance - totalPrice,
        basic_food_count: foodType === "basic" ? row.basic_food_count + quantity : row.basic_food_count,
        premium_food_count: foodType === "premium" ? row.premium_food_count + quantity : row.premium_food_count,
        last_interaction_at: new Date().toISOString(),
      };
      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      const creationAction = await insertCreationAction(client, {
        coupleId,
        actorId: current.user.id,
        actionType: "buy_food",
        actionLabel: `买入 ${quantity} 份${foodType === "premium" ? "鲜食粮" : "日常粮"}`,
        metadata: { foodType, quantity, totalPrice },
      });
      return { creationSpace, creationAction };
    });
    return result;
  }

  async function claimGameReward(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const puzzleId = String(input.puzzleId || input.puzzle_id || "").trim();
    const solved = Boolean(input.solved ?? true);
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!solved || !puzzleId || puzzleId.length > 80) {
      throw new AuthError("invalid_puzzle_reward", 400, "Puzzle reward is invalid.");
    }
    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const claim = await client.query(
        `
          insert into public.creation_game_reward_claims (couple_id, puzzle_id, reward_date, claimed_by)
          values ($1, $2, current_date, $3)
          on conflict (couple_id, puzzle_id, reward_date) do nothing
          returning id
        `,
        [coupleId, puzzleId, current.user.id],
      );
      if (!claim.rows[0]) {
        throw new AuthError("puzzle_reward_already_claimed_today", 409, "Puzzle reward was already claimed today.");
      }
      const patch = {
        ...mutableSpace(row),
        pet_mood: "happy",
        growth_points: row.growth_points + 8,
        affection: clamp(row.affection + 3),
        boredom: clamp(row.boredom - 6),
        curiosity: clamp(row.curiosity + 4),
        treat_balance: row.treat_balance + 15,
        premium_food_count: row.premium_food_count + 1,
        current_action: "happy",
        last_interaction_at: new Date().toISOString(),
        pet_world_state: "happy",
        pet_world_mood: "happy",
        last_ai_bubble: "通关啦",
      };
      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      const creationAction = await insertCreationAction(client, {
        coupleId,
        actorId: current.user.id,
        actionType: "game_reward",
        actionLabel: "领取了今日挑战奖励",
        metadata: { puzzleId },
      });
      return { creationSpace, creationAction };
    });
    return result;
  }

  async function summonPet(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    const surface = String(input.surface || input.petWorldSurface || input.pet_world_surface || "pet_room").trim();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    if (!petWorldSurfaces.has(surface)) {
      throw new AuthError("invalid_pet_surface", 400, "Pet surface is invalid.");
    }
    const result = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const row = await ensureCreationSpaceRow(client, coupleId);
      const now = new Date().toISOString();
      const patch = {
        ...mutableSpace(row),
        current_action: "happy",
        last_interaction_at: now,
        pet_world_surface: surface,
        pet_world_state: "summon",
        pet_world_mood: "happy",
        pet_hidden: false,
        pet_last_found_at: now,
        pet_last_surface_changed_at: surface === row.pet_world_surface ? row.pet_last_surface_changed_at : now,
        last_ai_bubble: "回来啦",
      };
      const creationSpace = await updateCreationSpace(client, coupleId, patch);
      const creationAction = await insertCreationAction(client, {
        coupleId,
        actorId: current.user.id,
        actionType: "pet",
        actionLabel: "召回云宠",
        metadata: { surface },
      });
      return { creationSpace, creationAction };
    });
    return result;
  }

  return {
    buyFood,
    claimGameReward,
    createPetMemory,
    ensureCreationSpace,
    feedPet,
    getActiveCreationSpace,
    interactPet,
    listCreationActions,
    listPetMemories,
    recordCreationAction,
    settlePetSleep,
    summonPet,
  };
}
