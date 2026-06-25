import { selfHostRequest } from "./apiClient";

export type SelfHostCouple = {
  id: string;
  relationshipStartedAt: string | null;
  createdAt: string;
};

export type SelfHostInvite = {
  id: string;
  inviteCode: string;
  inviterUserId: string;
  acceptedByUserId: string | null;
  coupleId: string | null;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
};

export async function getSelfHostActiveCouple(accessToken: string) {
  return selfHostRequest<{ couple: SelfHostCouple | null }>("/api/couples/active", {
    accessToken,
  });
}

export async function createSelfHostPairInvite(accessToken: string) {
  return selfHostRequest<{ invite: SelfHostInvite }>("/api/pair-invites", {
    method: "POST",
    accessToken,
  });
}

export async function acceptSelfHostPairInvite(input: {
  accessToken: string;
  inviteCode: string;
  relationshipStartedAt?: string | null;
}) {
  return selfHostRequest<{ couple: SelfHostCouple }>("/api/pair-invites/accept", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      inviteCode: input.inviteCode,
      relationshipStartedAt: input.relationshipStartedAt,
    },
  });
}
