import { selfHostRequest } from "./apiClient";
import type { Checkin, MoodStatus } from "@/lib/supabase/database.types";

type SelfHostCheckin = {
  id: string;
  coupleId: string;
  userId: string;
  checkinDate: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SelfHostMoodStatus = {
  id: string;
  coupleId: string;
  userId: string;
  mood: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapSelfHostCheckin(checkin: SelfHostCheckin): Checkin {
  return {
    id: checkin.id,
    couple_id: checkin.coupleId,
    user_id: checkin.userId,
    checkin_date: checkin.checkinDate,
    content: checkin.content,
    created_at: checkin.createdAt,
    updated_at: checkin.updatedAt,
    deleted_at: checkin.deletedAt,
  };
}

function mapSelfHostMoodStatus(moodStatus: SelfHostMoodStatus): MoodStatus {
  return {
    id: moodStatus.id,
    couple_id: moodStatus.coupleId,
    user_id: moodStatus.userId,
    mood: moodStatus.mood,
    note: moodStatus.note,
    created_at: moodStatus.createdAt,
    updated_at: moodStatus.updatedAt,
  };
}

export async function listSelfHostCheckins(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ checkins: SelfHostCheckin[] }>("/api/checkins", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 5000,
    },
  });
  return response.checkins.map(mapSelfHostCheckin);
}

export async function upsertSelfHostCheckin(input: {
  accessToken: string;
  coupleId: string;
  checkinDate: string;
  content: string | null;
}) {
  const response = await selfHostRequest<{ checkin: SelfHostCheckin }>("/api/checkins", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      checkinDate: input.checkinDate,
      content: input.content,
    },
  });
  return mapSelfHostCheckin(response.checkin);
}

export async function deleteSelfHostCheckin(input: {
  accessToken: string;
  checkinId: string;
}) {
  const response = await selfHostRequest<{ checkin: SelfHostCheckin }>("/api/checkins/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { checkinId: input.checkinId },
  });
  return mapSelfHostCheckin(response.checkin);
}

export async function listSelfHostMoodStatuses(input: {
  accessToken: string;
  coupleId: string;
}) {
  const response = await selfHostRequest<{ moodStatuses: SelfHostMoodStatus[] }>("/api/mood-status", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
    },
  });
  return response.moodStatuses.map(mapSelfHostMoodStatus);
}

export async function upsertSelfHostMoodStatus(input: {
  accessToken: string;
  coupleId: string;
  mood: string;
  note: string | null;
}) {
  const response = await selfHostRequest<{ moodStatus: SelfHostMoodStatus }>("/api/mood-status", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      mood: input.mood,
      note: input.note,
    },
  });
  return mapSelfHostMoodStatus(response.moodStatus);
}
