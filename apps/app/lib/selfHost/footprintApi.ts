import { selfHostRequest } from "./apiClient";
import type { CoupleFootprint } from "@/lib/supabase/database.types";

type SelfHostFootprint = {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function mapSelfHostFootprint(footprint: SelfHostFootprint): CoupleFootprint {
  return {
    id: footprint.id,
    couple_id: footprint.coupleId,
    created_by: footprint.createdBy,
    title: footprint.title,
    note: footprint.note,
    latitude: footprint.latitude,
    longitude: footprint.longitude,
    visited_at: footprint.visitedAt,
    created_at: footprint.createdAt,
    updated_at: footprint.updatedAt,
    deleted_at: footprint.deletedAt,
  };
}

export async function listSelfHostFootprints(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ footprints: SelfHostFootprint[] }>("/api/footprints", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 1000,
    },
  });
  return response.footprints.map(mapSelfHostFootprint);
}

export async function createSelfHostFootprint(input: {
  accessToken: string;
  coupleId: string;
  title: string;
  note?: string | null;
  visitedAt: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const response = await selfHostRequest<{ footprint: SelfHostFootprint }>("/api/footprints", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      title: input.title,
      note: input.note ?? null,
      visitedAt: input.visitedAt,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });
  return mapSelfHostFootprint(response.footprint);
}

export async function updateSelfHostFootprint(input: {
  accessToken: string;
  footprintId: string;
  title?: string;
  note?: string | null;
  visitedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const response = await selfHostRequest<{ footprint: SelfHostFootprint }>("/api/footprints/update", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      footprintId: input.footprintId,
      title: input.title,
      note: input.note,
      visitedAt: input.visitedAt,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
  return mapSelfHostFootprint(response.footprint);
}

export async function deleteSelfHostFootprint(input: {
  accessToken: string;
  footprintId: string;
}) {
  const response = await selfHostRequest<{ footprint: SelfHostFootprint }>("/api/footprints/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { footprintId: input.footprintId },
  });
  return mapSelfHostFootprint(response.footprint);
}
