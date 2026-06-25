import { selfHostRequest } from "./apiClient";
import type { CalendarEvent } from "@/lib/supabase/database.types";

type SelfHostCalendarEvent = {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  eventDate: string;
  type: CalendarEvent["type"];
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function mapSelfHostCalendarEvent(event: SelfHostCalendarEvent): CalendarEvent {
  return {
    id: event.id,
    couple_id: event.coupleId,
    created_by: event.createdBy,
    title: event.title,
    event_date: event.eventDate,
    type: event.type,
    note: event.note,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
    deleted_at: event.deletedAt,
  };
}

export async function listSelfHostCalendarEvents(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ events: SelfHostCalendarEvent[] }>("/api/calendar-events", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 60,
    },
  });
  return response.events.map(mapSelfHostCalendarEvent);
}

export async function createSelfHostCalendarEvent(input: {
  accessToken: string;
  coupleId: string;
  title: string;
  eventDate: string;
  type: CalendarEvent["type"];
  note?: string | null;
  remind?: boolean;
}) {
  const response = await selfHostRequest<{ event: SelfHostCalendarEvent }>("/api/calendar-events", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      title: input.title,
      eventDate: input.eventDate,
      type: input.type,
      note: input.note ?? null,
      remind: input.remind ?? false,
    },
  });
  return mapSelfHostCalendarEvent(response.event);
}

export async function updateSelfHostCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  title?: string;
  eventDate?: string;
  type?: CalendarEvent["type"];
  note?: string | null;
}) {
  const response = await selfHostRequest<{ event: SelfHostCalendarEvent }>("/api/calendar-events/update", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      eventId: input.eventId,
      title: input.title,
      eventDate: input.eventDate,
      type: input.type,
      note: input.note,
    },
  });
  return mapSelfHostCalendarEvent(response.event);
}

export async function deleteSelfHostCalendarEvent(input: {
  accessToken: string;
  eventId: string;
}) {
  const response = await selfHostRequest<{ event: SelfHostCalendarEvent }>("/api/calendar-events/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { eventId: input.eventId },
  });
  return mapSelfHostCalendarEvent(response.event);
}
