import { selfHostRequest } from "./apiClient";
import type { Message } from "@/lib/supabase/database.types";

type SelfHostMessage = {
  id: string;
  coupleId: string;
  senderId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  sender: {
    id: string;
    displayName: string | null;
    avatarStoragePath: string | null;
    avatarThumbnailStoragePath: string | null;
    birthday: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export function mapSelfHostMessage(message: SelfHostMessage): Message {
  return {
    id: message.id,
    couple_id: message.coupleId,
    sender_id: message.senderId,
    body: message.body,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    deleted_at: message.deletedAt,
    sender: message.sender
      ? {
          id: message.sender.id,
          display_name: message.sender.displayName,
          avatar_url: message.sender.avatarStoragePath,
          avatar_thumbnail_url: message.sender.avatarThumbnailStoragePath,
          birthdate: message.sender.birthday,
          created_at: message.sender.createdAt,
          updated_at: message.sender.updatedAt,
        }
      : undefined,
  };
}

export async function listSelfHostMessages(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ messages: SelfHostMessage[] }>("/api/messages", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 1000,
    },
  });
  return response.messages.map(mapSelfHostMessage);
}

export async function createSelfHostMessage(input: {
  accessToken: string;
  coupleId: string;
  body: string;
}) {
  const response = await selfHostRequest<{ message: SelfHostMessage }>("/api/messages", {
    method: "POST",
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
    },
    body: {
      body: input.body,
    },
  });
  return mapSelfHostMessage(response.message);
}

export async function deleteSelfHostMessage(input: {
  accessToken: string;
  messageId: string;
}) {
  const response = await selfHostRequest<{ message: SelfHostMessage }>("/api/messages/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { messageId: input.messageId },
  });
  return mapSelfHostMessage(response.message);
}
