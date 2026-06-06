import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

type PetAiAction = "idle" | "walk" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy";
type MemoryType = "preference" | "care_summary" | "footprint" | "online_together" | "milestone";
type MemoryScope = "short" | "core";
type PetWorldSurface = "home" | "share" | "memory" | "creation_hub" | "pet_room" | "footprints" | "playground";
type PetWorldIntent = "wander" | "hide" | "seek_attention" | "inspect_memory" | "visit_partner" | "return_home" | "rest" | "play" | "ask_food" | "comfort_user";
type PetWorldMood = "happy" | "curious" | "sleepy" | "lonely" | "excited" | "calm" | "hungry";
type PetWorldAnimation = "idle" | "walk" | "run" | "hop" | "float" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy" | "curious" | "hide" | "peek" | "found" | "summon" | "return_home" | "inspect" | "visit_partner";

type PetAiDecision = {
  action: PetAiAction;
  mood: string;
  bubble: string;
  state_delta: {
    fullness: number;
    cleanliness: number;
    affection: number;
    energy: number;
    boredom: number;
    comfort: number;
    growth_points: number;
  };
  memory: {
    should_write: boolean;
    memory_type: MemoryType;
    memory_scope: MemoryScope;
    importance: number;
    summary: string;
  };
  rig_cue: {
    gaze: "user" | "bowl" | "toy" | "partner" | "none";
    blink: "normal" | "slow" | "sleepy";
    tail: "still" | "soft" | "fast";
    pose: "stand" | "sit" | "crouch" | "nap" | "bounce";
  };
  world: {
    intent: PetWorldIntent;
    target_surface: PetWorldSurface;
    mood: PetWorldMood;
    animation: PetWorldAnimation;
    bubble: string;
    memory_policy: {
      should_write: boolean;
      importance: number;
      summary: string;
    };
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const siliconFlowApiKey = Deno.env.get("SILICONFLOW_API_KEY");
const siliconFlowBaseUrl = Deno.env.get("SILICONFLOW_BASE_URL") ?? "https://api.siliconflow.cn/v1";
const siliconFlowModel = Deno.env.get("SILICONFLOW_PET_MODEL") ?? "deepseek-ai/DeepSeek-V4-Flash";
const dailyLimit = parseInt(Deno.env.get("PET_AI_DAILY_LIMIT") ?? "40", 10);
const timeoutMs = parseInt(Deno.env.get("PET_AI_TIMEOUT_MS") ?? "4500", 10);

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ error: "invalid_authorization" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  const body = await request.json().catch(() => null) as {
    coupleId?: string;
    triggerType?: string;
    localHint?: Record<string, unknown>;
  } | null;
  const coupleId = typeof body?.coupleId === "string" ? body.coupleId : "";
  const triggerType = sanitizeTrigger(body?.triggerType);
  const localHint = sanitizeLocalHint(body?.localHint);

  if (!coupleId) {
    return jsonResponse({ error: "couple_id_required" }, 400);
  }

  const startedAt = Date.now();
  const { data: context, error: contextError } = await userClient.rpc("prepare_pet_ai_context", {
    target_couple_id: coupleId,
    trigger_type: triggerType,
  });

  if (contextError) {
    return jsonResponse({ error: contextError.message }, 403);
  }

  const todayAiCount = Number((context as { today_ai_count?: unknown } | null)?.today_ai_count ?? 0);
  if (!siliconFlowApiKey) {
    return fallback(userClient, coupleId, triggerType, "missing_api_key");
  }
  if (Number.isFinite(todayAiCount) && todayAiCount >= dailyLimit) {
    return fallback(userClient, coupleId, triggerType, "daily_limit");
  }

  const inputSummary = buildInputSummary(context, localHint);

  try {
    const decision = await requestSiliconFlowDecision({
      context,
      localHint,
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1800, Math.min(timeoutMs, 4500)) : 3500,
    });
    const durationMs = Date.now() - startedAt;
    const { data: space, error: applyError } = await userClient.rpc("apply_pet_ai_decision", {
      target_couple_id: coupleId,
      trigger_type: triggerType,
      decision,
      generation_meta: {
        model: siliconFlowModel,
        fallback_used: false,
        duration_ms: durationMs,
        input_summary: inputSummary,
      },
    }).maybeSingle();

    if (applyError) {
      return fallback(userClient, coupleId, triggerType, `apply_${applyError.message}`.slice(0, 60));
    }

    const { data: worldSpace, error: worldApplyError } = await userClient.rpc("apply_pet_world_decision", {
      target_couple_id: coupleId,
      decision: decision.world,
      generation_meta: {
        model: siliconFlowModel,
        fallback_used: false,
        duration_ms: durationMs,
        source: "edge_ai_success",
        input_summary: inputSummary,
      },
    }).maybeSingle();

    if (worldApplyError) {
      return fallback(userClient, coupleId, triggerType, `world_${worldApplyError.message}`.slice(0, 60));
    }

    return jsonResponse({
      space: worldSpace ?? space ?? null,
      decision,
      fallback: false,
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "ai_failed";
    return fallback(userClient, coupleId, triggerType, errorCode.slice(0, 60));
  }
});

async function requestSiliconFlowDecision({
  context,
  localHint,
  timeoutMs,
}: {
  context: unknown;
  localHint: Record<string, unknown>;
  timeoutMs: number;
}) {
  const compactContext = buildCompactPetContext(context);
  const triggerType = typeof compactContext.trigger_type === "string" ? compactContext.trigger_type : "interaction";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${siliconFlowBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${siliconFlowApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: siliconFlowModel,
        messages: [
          {
            role: "system",
            content: [
              "只输出严格 JSON，不要 Markdown，不要解释。",
              "你就是情侣 App 里这只奶油白 Q 版心愿精灵“迪灵”本身，不是旁白、助手或系统。mood 和 bubble 都必须像迪灵亲口对用户说。",
              "迪灵形象固定：奶油白圆润身体、大蓝眼、浅蓝三瓣头冠、垂耳月牙光、黄色爱心肚纹、蓝色卷尾和小爪。语气是原创轻奇幻小精灵第一人称。",
              "不要根据 pet_species 改成猫或狗。禁止使用汪、喵、小猫、小狗、猫咪、狗狗、云猫、云狗、奶霜、银纹、小金、柚柚。",
              "bubble 7-16 个汉字，mood 12-28 个汉字。语气亲近、短、口语化，像小精灵贴近用户，不要堆形容词。",
              "禁止写“它/云宠/宠物正在/小狗正在/小猫正在/正在生成/正在思考/我还在叼这句话”。",
              "trigger_type=clean 表示用户在打扫小屋、窝垫、饭碗或地面，不是给宠物洗澡。clean 时禁止写洗澡、擦澡、刚擦完澡、毛发、毛茸茸、棉花糖、地板能照镜子、小风扇、亮晶晶。",
              "不要使用夸张比喻或生硬拟人，例如棉花糖、小风扇、照镜子、闪闪发光、亮晶晶。宁可简单说“小窝干净啦”。",
              "好例子：clean -> “小窝干净啦，我想靠近你”；pet -> “摸摸头好舒服”；feed -> “我吃饱啦，想靠近你”。",
              "状态变化要轻微。高频喂养、抚摸、清洁不要写 core 记忆。",
              "只使用低敏上下文，不索要或推断留言、信件、胶囊正文、照片或精确坐标。",
              "world 只表达全局宠物行为意图：想去哪、想做什么、用哪个动画和一句气泡。不要输出坐标、DOM、用户资料或数据库字段。",
              "world.target_surface 必须从白名单选择；隐私页、设置页、登录页、信件正文、图片全屏和输入状态都不能作为目标。",
              "localHint.surface 只是用户当前所在页面，不代表迪灵必须过去。除非 trigger_type 明确是 summon/find/found，否则不要因为用户切页就把 world.target_surface 改成 localHint.surface。",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              schema: outputSchemaHint,
              context: compactContext,
              localHint,
            }),
          },
        ],
        temperature: 0.35,
        max_tokens: 220,
        response_format: { type: "json_object" },
        enable_thinking: false,
      }),
    });

    const responseBody = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      throw new Error(response.status === 429 ? "ai_rate_limited" : `ai_http_${response.status}`);
    }

    const content = responseBody?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("ai_empty_content");
    }

    return normalizeDecision(parseJsonContent(content), triggerType, localHint, compactContext.space);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("ai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fallback(userClient: ReturnType<typeof createClient>, coupleId: string, triggerType: string, errorCode: string) {
  const { data: space, error } = await userClient.rpc("apply_pet_brain_fallback", {
    target_couple_id: coupleId,
    trigger_type: triggerType,
  }).maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message, fallback: true, errorCode }, 500);
  }
  const fallbackWorld = normalizeWorldDecision(
    null,
    triggerType,
    {},
    space && typeof space === "object" ? space as Record<string, unknown> : {},
    {
      action: enumValue((space as { current_action?: unknown } | null)?.current_action, ["idle", "walk", "eat", "pet", "clean", "play", "sleep", "sad", "happy"], "idle"),
      bubble: typeof (space as { last_ai_bubble?: unknown } | null)?.last_ai_bubble === "string"
        ? (space as { last_ai_bubble: string }).last_ai_bubble
        : naturalFallbackLine(triggerType, "idle", "bubble"),
    },
  );
  const { data: worldSpace, error: worldError } = await userClient.rpc("apply_pet_world_decision", {
    target_couple_id: coupleId,
    decision: fallbackWorld,
    generation_meta: {
      fallback_used: true,
      error_code: errorCode,
      source: "edge_fallback",
    },
  }).maybeSingle();

  if (worldError) {
    return jsonResponse({
      error: worldError.message,
      fallback: true,
      errorCode: `world_${errorCode}`.slice(0, 60),
    }, 500);
  }

  return jsonResponse({
    space: worldSpace ?? space ?? null,
    decision: {
      action: enumValue((space as { current_action?: unknown } | null)?.current_action, ["idle", "walk", "eat", "pet", "clean", "play", "sleep", "sad", "happy"], "idle"),
      mood: typeof (space as { pet_mood?: unknown } | null)?.pet_mood === "string" ? (space as { pet_mood: string }).pet_mood : fallbackWorld.bubble,
      bubble: fallbackWorld.bubble,
      world: fallbackWorld,
    },
    fallback: true,
    errorCode,
  });
}

function parseJsonContent(content: string) {
  const clean = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("invalid_json");
  }
}

function normalizeDecision(
  raw: unknown,
  triggerType = "interaction",
  localHint: Record<string, unknown> = {},
  compactSpace: Record<string, unknown> = {},
): PetAiDecision {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_decision");
  }
  const value = raw as Record<string, unknown>;
  const action = enumValue(value.action, ["idle", "walk", "eat", "pet", "clean", "play", "sleep", "sad", "happy"], "idle");
  const mood = normalizePetSpeech(clampText(value.mood, 34, ""), triggerType, action, "mood");
  const bubble = normalizePetSpeech(clampText(value.bubble, 24, mood), triggerType, action, "bubble");
  if (hasUrl(mood) || hasUrl(bubble)) {
    throw new Error("invalid_text");
  }
  const delta = typeof value.state_delta === "object" && value.state_delta && !Array.isArray(value.state_delta)
    ? value.state_delta as Record<string, unknown>
    : {};
  const memory = typeof value.memory === "object" && value.memory && !Array.isArray(value.memory)
    ? value.memory as Record<string, unknown>
    : {};
  const rigCue = typeof value.rig_cue === "object" && value.rig_cue && !Array.isArray(value.rig_cue)
    ? value.rig_cue as Record<string, unknown>
    : {};

  const roomDecision = {
    action,
    mood,
    bubble,
    state_delta: {
      fullness: clampNumber(delta.fullness, -20, 20, 0),
      cleanliness: clampNumber(delta.cleanliness, -20, 20, 0),
      affection: clampNumber(delta.affection, -20, 20, 0),
      energy: clampNumber(delta.energy, -20, 20, 0),
      boredom: clampNumber(delta.boredom, -25, 25, 0),
      comfort: clampNumber(delta.comfort, -20, 20, 0),
      growth_points: clampNumber(delta.growth_points, 0, 15, 0),
    },
    memory: {
      should_write: valueToBoolean(memory.should_write),
      memory_type: enumValue(memory.memory_type, ["preference", "care_summary", "footprint", "online_together", "milestone"], "care_summary"),
      memory_scope: enumValue(memory.memory_scope, ["short", "core"], "short"),
      importance: clampNumber(memory.importance, 0, 100, 0),
      summary: clampText(memory.summary, 60, ""),
    },
    rig_cue: {
      gaze: enumValue(rigCue.gaze, ["user", "bowl", "toy", "partner", "none"], "none"),
      blink: enumValue(rigCue.blink, ["normal", "slow", "sleepy"], "normal"),
      tail: enumValue(rigCue.tail, ["still", "soft", "fast"], "soft"),
      pose: enumValue(rigCue.pose, ["stand", "sit", "crouch", "nap", "bounce"], "stand"),
    },
  };
  return {
    ...roomDecision,
    world: normalizeWorldDecision(value.world, triggerType, localHint, compactSpace, roomDecision),
  };
}

function normalizeWorldDecision(
  rawWorld: unknown,
  triggerType: string,
  localHint: Record<string, unknown>,
  compactSpace: Record<string, unknown>,
  roomDecision: Pick<PetAiDecision, "action" | "bubble">,
): PetAiDecision["world"] {
  const world = rawWorld && typeof rawWorld === "object" && !Array.isArray(rawWorld)
    ? rawWorld as Record<string, unknown>
    : {};
  const localSurface = enumValue(localHint.surface, ["home", "share", "memory", "creation_hub", "pet_room", "footprints", "playground"], "home");
  const currentPetSurface = enumValue(compactSpace.pet_world_surface, ["home", "share", "memory", "creation_hub", "pet_room", "footprints", "playground"], localSurface);
  const fullness = clampNumber(compactSpace.fullness, 0, 100, 60);
  const energy = clampNumber(compactSpace.energy, 0, 100, 60);
  const partnerOnline = localHint.partner_online === true;
  const fallbackIntent: PetWorldIntent = triggerType.includes("hide")
    ? "hide"
    : triggerType.includes("summon")
      ? "return_home"
      : fullness < 30
        ? "ask_food"
        : partnerOnline
          ? "seek_attention"
          : roomDecision.action === "play"
            ? "play"
            : "wander";
  const directUserSurfaceTriggers = /summon|find|found/.test(triggerType);
  const fallbackSurface: PetWorldSurface = fallbackIntent === "ask_food" || fallbackIntent === "return_home"
    ? "pet_room"
    : directUserSurfaceTriggers
      ? localSurface
      : currentPetSurface;
  const requestedSurface = enumValue(world.target_surface, ["home", "share", "memory", "creation_hub", "pet_room", "footprints", "playground"], fallbackSurface);
  const surfaceMovesAllowed = directUserSurfaceTriggers || world.intent === "hide" || world.intent === "return_home" || world.intent === "ask_food" || world.intent === "play" || world.intent === "inspect_memory" || world.intent === "visit_partner";
  const targetSurface: PetWorldSurface = !surfaceMovesAllowed && requestedSurface === localSurface && localSurface !== currentPetSurface
    ? currentPetSurface
    : requestedSurface;
  const fallbackAnimation: PetWorldAnimation = fallbackIntent === "hide"
    ? "hide"
    : fallbackIntent === "return_home"
      ? "return_home"
      : roomDecision.action === "happy"
        ? "happy"
        : roomDecision.action === "sad"
          ? "sad"
          : energy < 24
            ? "sleep"
            : roomDecision.action;
  const fallbackMood: PetWorldMood = fullness < 30
    ? "hungry"
    : energy < 24
      ? "sleepy"
      : partnerOnline
        ? "excited"
        : "calm";
  return {
    intent: enumValue(world.intent, ["wander", "hide", "seek_attention", "inspect_memory", "visit_partner", "return_home", "rest", "play", "ask_food", "comfort_user"], fallbackIntent),
    target_surface: targetSurface,
    mood: enumValue(world.mood, ["happy", "curious", "sleepy", "lonely", "excited", "calm", "hungry"], fallbackMood),
    animation: enumValue(world.animation, ["idle", "walk", "run", "hop", "float", "eat", "pet", "clean", "play", "sleep", "sad", "happy", "curious", "hide", "peek", "found", "summon", "return_home", "inspect", "visit_partner"], fallbackAnimation),
    bubble: normalizePetSpeech(clampText(world.bubble, 24, roomDecision.bubble), triggerType, roomDecision.action, "bubble"),
    memory_policy: {
      should_write: false,
      importance: 0,
      summary: "",
    },
  };
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallbackValue: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallbackValue;
}

function clampText(value: unknown, maxLength: number, fallbackValue: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallbackValue).slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number, fallbackValue: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallbackValue;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function valueToBoolean(value: unknown) {
  return value === true || value === "true";
}

function normalizePetSpeech(
  value: string,
  triggerType: string,
  action: PetAiAction,
  field: "mood" | "bubble",
) {
  const fallbackValue = naturalFallbackLine(triggerType, action, field);
  const withoutRobotTone = value
    .replace(/它/g, "我")
    .replace(/迪灵正在|宠物正在|云宠正在|小狗正在|狗狗正在|小猫正在|猫咪正在/g, "我在")
    .replace(/云宠|小狗|狗狗|小猫|猫咪|云猫|云狗|奶霜|银纹|小金|柚柚/g, "迪灵")
    .replace(/[汪喵]+[,，!！~～]*/g, "")
    .replace(/正在想怎么回应你们。?/g, "我听见你啦")
    .replace(/我还在叼这句话。?/g, "我听见你啦")
    .replace(/叼一句话回来。?/g, "我回来啦")
    .replace(/等我摇完尾巴。?/g, "我在这里呀")
    .replace(/[!！~～]+/g, "，")
    .replace(/[。；;]+/g, "")
    .replace(/，{2,}/g, "，")
    .replace(/\s+/g, "")
    .trim();
  const clean = withoutRobotTone.replace(/^迪灵[,，]*/, "");
  if (shouldReplaceWithNaturalFallback(clean, triggerType, action)) {
    return fallbackValue;
  }
  const next = clean || fallbackValue;
  return next.slice(0, field === "mood" ? 34 : 24);
}

function shouldReplaceWithNaturalFallback(value: string, triggerType: string, action: PetAiAction) {
  if (!value) {
    return true;
  }
  if (/AI|json|JSON|系统|模型|助手|用户|生成|思考|处理中|请稍候/i.test(value)) {
    return true;
  }
  if (/汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|香喷喷|毛茸茸的像|叼这句话/.test(value)) {
    return true;
  }
  if ((triggerType === "clean" || action === "clean") && /洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛发|毛茸茸|身上|澡/.test(value)) {
    return true;
  }
  return false;
}

function naturalFallbackLine(
  triggerType: string,
  action: PetAiAction,
  field: "mood" | "bubble",
) {
  const lines: Record<string, string> = {
    feed: field === "mood" ? "我吃饱啦，想靠近你" : "我吃饱啦",
    pet: field === "mood" ? "摸摸头好舒服" : "再摸摸我",
    clean: field === "mood" ? "小窝干净啦，我想靠近你" : "小窝干净啦",
    play: field === "mood" ? "还想和你玩一会儿" : "还想玩",
    sleep: field === "mood" ? "我想趴在你身边" : "我趴一会儿",
    sad: field === "mood" ? "想让你陪陪我" : "陪陪我吧",
    footprint: field === "mood" ? "我记住这个地方啦" : "我记住啦",
    idle: field === "mood" ? "我在这里等你" : "我在这里呀",
  };
  const key = triggerType.startsWith("feed") ? "feed" : triggerType === "footprint_add" ? "footprint" : action;
  return lines[key] ?? lines.idle;
}

function hasUrl(value: string) {
  return /https?:\/\/|www\./i.test(value);
}

function sanitizeTrigger(value: unknown) {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "interaction";
  return (clean || "interaction").replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
}

function sanitizeLocalHint(value: unknown): Record<string, unknown> {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const surface = enumValue(raw.surface, ["home", "share", "memory", "creation_hub", "pet_room", "footprints", "playground"], "home");
  return {
    surface,
    partner_online: raw.partner_online === true,
  };
}

function buildInputSummary(context: unknown, localHint: Record<string, unknown> | undefined) {
  const contextObject = context && typeof context === "object" ? context as Record<string, unknown> : {};
  const space = contextObject.space && typeof contextObject.space === "object" ? contextObject.space as Record<string, unknown> : {};
  return {
    trigger_type: contextObject.trigger_type,
    pet_key: space.pet_key,
    pet_species: space.pet_species,
    pet_level: space.pet_level,
    memories_count: Array.isArray(contextObject.memories) ? contextObject.memories.length : 0,
    recent_actions_count: Array.isArray(contextObject.recent_actions) ? contextObject.recent_actions.length : 0,
    recent_footprints_count: Array.isArray(contextObject.recent_footprints) ? contextObject.recent_footprints.length : 0,
    local_hint_keys: localHint ? Object.keys(localHint).slice(0, 12) : [],
  };
}

function buildCompactPetContext(context: unknown) {
  const contextObject = context && typeof context === "object" ? context as Record<string, unknown> : {};
  const space = contextObject.space && typeof contextObject.space === "object" ? contextObject.space as Record<string, unknown> : {};
  const memories = Array.isArray(contextObject.memories) ? contextObject.memories.slice(0, 5) : [];
  const recentActions = Array.isArray(contextObject.recent_actions) ? contextObject.recent_actions.slice(0, 5) : [];
  const recentFootprints = Array.isArray(contextObject.recent_footprints) ? contextObject.recent_footprints.slice(0, 3) : [];
  return {
    trigger_type: contextObject.trigger_type,
    today_ai_count: contextObject.today_ai_count,
    space: {
      pet_key: space.pet_key,
      pet_species: space.pet_species,
      pet_name: space.pet_name,
      pet_mood: space.pet_mood,
      pet_level: space.pet_level,
      fullness: space.fullness,
      cleanliness: space.cleanliness,
      affection: space.affection,
      energy: space.energy,
      boredom: space.boredom,
      comfort: space.comfort,
      current_action: space.current_action,
      pet_world_surface: space.pet_world_surface,
      treat_balance: space.treat_balance,
      basic_food_count: space.basic_food_count,
      premium_food_count: space.premium_food_count,
    },
    memories,
    recent_actions: recentActions,
    recent_footprints: recentFootprints,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

const outputSchemaHint = {
  action: "idle | walk | eat | pet | clean | play | sleep | sad | happy",
  mood: "不超过 40 字",
  bubble: "不超过 36 字",
  state_delta: {
    fullness: 0,
    cleanliness: 0,
    affection: 0,
    energy: 0,
    boredom: 0,
    comfort: 0,
    growth_points: 0,
  },
  memory: {
    should_write: false,
    memory_type: "preference | care_summary | footprint | online_together | milestone",
    memory_scope: "short | core",
    importance: 0,
    summary: "不超过 60 字",
  },
  rig_cue: {
    gaze: "user | bowl | toy | partner | none",
    blink: "normal | slow | sleepy",
    tail: "still | soft | fast",
    pose: "stand | sit | crouch | nap | bounce",
  },
  world: {
    intent: "wander | hide | seek_attention | inspect_memory | visit_partner | return_home | rest | play | ask_food | comfort_user",
    target_surface: "home | share | memory | creation_hub | pet_room | footprints | playground",
    mood: "happy | curious | sleepy | lonely | excited | calm | hungry",
    animation: "idle | walk | run | hop | float | eat | pet | clean | play | sleep | sad | happy | curious | hide | peek | found | summon | return_home | inspect | visit_partner",
    bubble: "不超过 24 字",
    memory_policy: {
      should_write: false,
      importance: 0,
      summary: "不超过 60 字",
    },
  },
};
