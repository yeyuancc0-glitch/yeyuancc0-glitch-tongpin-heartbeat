import { selfHostRequest } from "./apiClient";
import type { LetterPreview } from "@/lib/supabase/database.types";

type SelfHostLetter = {
  id: string;
  coupleId: string;
  authorId: string;
  recipientId: string;
  authorDisplayName: string | null;
  title: string;
  body: string | null;
  deliverAt: string;
  unlockAt: string;
  isLocked: boolean;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
};

function mapSelfHostLetter(letter: SelfHostLetter): LetterPreview {
  return {
    id: letter.id,
    couple_id: letter.coupleId,
    author_id: letter.authorId,
    recipient_id: letter.recipientId,
    author_display_name: letter.authorDisplayName,
    title: letter.title,
    body: letter.body,
    deliver_at: letter.deliverAt,
    unlock_at: letter.unlockAt,
    is_locked: letter.isLocked,
    read_at: letter.readAt,
    dismissed_at: letter.dismissedAt,
    created_at: letter.createdAt,
    deleted_at: letter.deletedAt,
  };
}

export async function listSelfHostLetters(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ letters: SelfHostLetter[] }>("/api/letters", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 30,
    },
  });
  return response.letters.map(mapSelfHostLetter);
}

export async function createSelfHostLetter(input: {
  accessToken: string;
  coupleId: string;
  title: string;
  body: string;
  unlockAt: string;
}) {
  const response = await selfHostRequest<{ letter: SelfHostLetter }>("/api/letters", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      title: input.title,
      body: input.body,
      unlockAt: input.unlockAt,
    },
  });
  return mapSelfHostLetter(response.letter);
}

export async function markSelfHostLetterRead(input: {
  accessToken: string;
  letterId: string;
}) {
  const response = await selfHostRequest<{ letter: SelfHostLetter }>("/api/letters/read", {
    method: "POST",
    accessToken: input.accessToken,
    body: { letterId: input.letterId },
  });
  return mapSelfHostLetter(response.letter);
}

export async function dismissSelfHostLetter(input: {
  accessToken: string;
  letterId: string;
}) {
  const response = await selfHostRequest<{ letter: SelfHostLetter }>("/api/letters/dismiss", {
    method: "POST",
    accessToken: input.accessToken,
    body: { letterId: input.letterId },
  });
  return mapSelfHostLetter(response.letter);
}

export async function deleteSelfHostLetter(input: {
  accessToken: string;
  letterId: string;
}) {
  const response = await selfHostRequest<{ letter: SelfHostLetter }>("/api/letters/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { letterId: input.letterId },
  });
  return mapSelfHostLetter(response.letter);
}
