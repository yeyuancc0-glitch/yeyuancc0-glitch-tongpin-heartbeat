export type SelfHostAuthMode = "self-host";

export type AppAuthUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean;
  disabled?: boolean;
  user_metadata: {
    display_name?: string | null;
    [key: string]: unknown;
  };
  app_metadata?: Record<string, unknown>;
};

export type AppAuthSession = {
  provider: SelfHostAuthMode;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  token_type: string;
  user: AppAuthUser;
};

export type SelfHostUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  profile?: {
    displayName?: string | null;
    avatarStoragePath?: string | null;
    avatarThumbnailStoragePath?: string | null;
    birthday?: string | null;
  };
};

export type SelfHostSession = {
  tokenType: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type SelfHostAuthResponse = {
  user: SelfHostUser;
  session?: SelfHostSession;
  status?: string;
  debugToken?: string;
  emailVerification?: {
    status: string;
    debugToken?: string;
  };
  passwordReset?: {
    status: string;
    debugToken?: string;
  };
  requestId?: string;
};
