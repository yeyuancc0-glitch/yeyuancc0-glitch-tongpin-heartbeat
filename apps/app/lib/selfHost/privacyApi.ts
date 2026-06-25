import { selfHostRequest } from "./apiClient";

type SelfHostEndedCouple = {
  id: string;
  relationshipStartedAt: string | null;
  createdAt: string;
  endedAt: string | null;
  status: "active" | "ended";
};

type SelfHostFeedback = {
  id: string;
  userId: string;
  coupleId: string | null;
  body: string;
  status: "open" | "reviewed" | "closed";
  metadata: Record<string, unknown>;
  createdAt: string;
};

type SelfHostReport = {
  id: string;
  coupleId: string | null;
  reporterId: string;
  reportedUserId: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "closed";
  createdAt: string;
};

type SelfHostBlock = {
  id: string;
  blockerId: string;
  blockedUserId: string;
  coupleId: string | null;
  reason: string | null;
  createdAt: string;
};

type SelfHostDeletionRequest = {
  id: string;
  userId: string;
  reason: string | null;
  status: "requested" | "processing" | "cancelled" | "completed";
  requestedAt: string;
  resolvedAt: string | null;
};

export async function submitSelfHostFeedback(input: {
  accessToken: string;
  body: string;
  coupleId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return selfHostRequest<{ feedback: SelfHostFeedback }>("/api/feedback", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      body: input.body,
      coupleId: input.coupleId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

export async function submitSelfHostReport(input: {
  accessToken: string;
  coupleId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
}) {
  return selfHostRequest<{ report: SelfHostReport }>("/api/reports", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      details: input.details ?? null,
    },
  });
}

export async function endSelfHostActiveCouple(accessToken: string) {
  return selfHostRequest<{ couple: SelfHostEndedCouple }>("/api/couples/active/end", {
    method: "POST",
    accessToken,
  });
}

export async function blockSelfHostPartnerAndEndCouple(input: {
  accessToken: string;
  reason?: string | null;
}) {
  return selfHostRequest<{ block: SelfHostBlock; couple: SelfHostEndedCouple }>("/api/privacy/block-partner", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      reason: input.reason ?? null,
    },
  });
}

export async function requestSelfHostAccountDeletion(input: {
  accessToken: string;
  reason?: string | null;
}) {
  return selfHostRequest<{
    deletionRequest: SelfHostDeletionRequest;
    profile: {
      id: string;
      account_status: "active" | "deletion_requested" | "frozen";
      deletion_requested_at: string | null;
    };
    couple: SelfHostEndedCouple | null;
  }>("/api/privacy/account-deletion", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      reason: input.reason ?? null,
    },
  });
}
