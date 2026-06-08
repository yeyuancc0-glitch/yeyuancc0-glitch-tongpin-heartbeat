export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_thumbnail_url: string | null;
  avatar_signed_url?: string | null;
  avatar_thumb_signed_url?: string | null;
  birthdate: string | null;
  account_status: "active" | "deletion_requested" | "frozen";
  deletion_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PairInvite = {
  id: string;
  code: string;
  created_by: string;
  accepted_by: string | null;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

export type Couple = {
  id: string;
  started_at: string;
  anniversary_date: string | null;
  status: "active" | "ended";
  created_by: string;
  created_at: string;
  ended_at: string | null;
};

export type CoupleMember = {
  id: string;
  couple_id: string;
  user_id: string;
  role: "member";
  joined_at: string;
  left_at: string | null;
  profile?: Profile;
};

export type Checkin = {
  id: string;
  couple_id: string;
  user_id: string;
  checkin_date: string;
  content: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  couple_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sender?: Profile;
};

export type CalendarEvent = {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  event_date: string;
  type: "anniversary" | "date" | "todo" | "other";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Letter = {
  id: string;
  couple_id: string;
  author_id: string;
  recipient_id: string | null;
  title: string;
  body: string;
  unlock_at: string;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LetterPreview = {
  id: string;
  couple_id: string;
  author_id: string;
  recipient_id: string;
  author_display_name: string | null;
  title: string;
  body: string | null;
  deliver_at: string;
  unlock_at: string;
  is_locked: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type MediaFile = {
  id: string;
  couple_id: string;
  uploader_id: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  signedUrl?: string | null;
  thumbnailSignedUrl?: string | null;
};

export type MoodStatus = {
  id: string;
  couple_id: string;
  user_id: string;
  mood: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  couple_id: string | null;
  user_id: string;
  actor_id: string | null;
  type: "letter" | "message" | "checkin" | "calendar_event" | "system";
  title: string;
  body: string | null;
  related_table: string | null;
  related_id: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  provider: "expo" | "web_push";
  device_id: string | null;
  platform: "ios" | "android" | "web" | "unknown";
  app_version: string | null;
  web_p256dh: string | null;
  web_auth: string | null;
  user_agent: string | null;
  enabled: boolean;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type NotificationPreference = {
  user_id: string;
  push_enabled: boolean;
  message_enabled: boolean;
  interaction_enabled: boolean;
  checkin_enabled: boolean;
  letter_enabled: boolean;
  calendar_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  created_at: string;
  updated_at: string;
};

export type PushDelivery = {
  id: string;
  notification_id: string;
  user_id: string;
  status: "pending" | "sent" | "skipped" | "failed";
  attempt_count: number;
  last_error: string | null;
  expo_ticket_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Report = {
  id: string;
  couple_id: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "closed";
  created_at: string;
};

export type Block = {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  couple_id: string | null;
  reason: string | null;
  created_at: string;
};

export type AccountDeletionRequest = {
  id: string;
  user_id: string;
  reason: string | null;
  status: "requested" | "processing" | "cancelled" | "completed";
  requested_at: string;
  resolved_at: string | null;
};

export type CreationSpace = {
  id: string;
  couple_id: string;
  pet_key: "silver_tabby" | "golden_retriever" | "cream_shorthair" | "corgi";
  pet_species: "cat" | "dog";
  pet_name: string;
  pet_mood: string;
  pet_level: number;
  growth_points: number;
  fullness: number;
  cleanliness: number;
  affection: number;
  energy: number;
  boredom: number;
  comfort: number;
  curiosity: number;
  current_action: "idle" | "walk" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy";
  personality_seed: string;
  last_brain_tick_at: string | null;
  last_ai_response_at: string | null;
  last_ai_bubble: string | null;
  last_rig_cue: Json;
  treat_balance: number;
  basic_food_count: number;
  premium_food_count: number;
  last_fed_food: "basic" | "premium" | null;
  last_fed_at: string | null;
  last_played_at: string | null;
  home_theme: string;
  decor_slot_1: string;
  decor_slot_2: string;
  decor_slot_3: string;
  last_interaction_at: string | null;
  last_world_decision: Json;
  pet_world_surface: "home" | "share" | "memory" | "creation_hub" | "pet_room" | "footprints" | "playground";
  pet_world_state: "idle" | "walk" | "run" | "hop" | "float" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy" | "curious" | "hide" | "peek" | "found" | "summon" | "return_home" | "inspect" | "visit_partner";
  pet_world_mood: "happy" | "curious" | "sleepy" | "lonely" | "excited" | "calm" | "hungry";
  pet_hidden: boolean;
  pet_last_seen_at: string | null;
  pet_last_found_at: string | null;
  pet_last_surface_changed_at: string | null;
  pet_sleep_started_at: string | null;
  pet_sleep_recovered_energy: number;
  created_at: string;
  updated_at: string;
};

export type CreationAction = {
  id: string;
  couple_id: string;
  actor_id: string;
  action_type: "feed" | "pet" | "clean" | "play" | "sleep" | "rename" | "decorate" | "choose_pet" | "buy_food" | "game_reward" | "ai_brain" | "memory_update" | "footprint_add" | "footprint_update" | "footprint_delete";
  action_label: string;
  metadata: Json;
  created_at: string;
};

export type PetMemory = {
  id: string;
  couple_id: string;
  memory_type: "preference" | "care_summary" | "event" | "footprint" | "online_together" | "milestone";
  memory_scope: "short" | "core";
  importance: number;
  summary: string;
  metadata: Json;
  expires_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type PetAiGeneration = {
  id: string;
  couple_id: string;
  actor_id: string | null;
  trigger_type: string;
  model: string | null;
  input_summary: Json;
  output_json: Json;
  fallback_used: boolean;
  error_code: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type PetWorldEvent = {
  id: string;
  couple_id: string;
  actor_id: string | null;
  event_type: string;
  surface: string;
  intent: string | null;
  metadata: Json;
  created_at: string;
};

export type CoupleFootprint = {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  visited_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ActiveCouple = Couple & {
  couple_members: CoupleMember[];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          avatar_thumbnail_url?: string | null;
          birthdate?: string | null;
          account_status?: Profile["account_status"];
          deletion_requested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, "id" | "created_at">>;
        Relationships: [];
      };
      pair_invites: {
        Row: PairInvite;
        Insert: {
          id?: string;
          code?: string;
          created_by: string;
          accepted_by?: string | null;
          status?: PairInvite["status"];
          expires_at: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: Partial<Omit<PairInvite, "id" | "created_by" | "created_at">>;
        Relationships: [];
      };
      couples: {
        Row: Couple;
        Insert: {
          id?: string;
          started_at?: string;
          anniversary_date?: string | null;
          status?: Couple["status"];
          created_by: string;
          created_at?: string;
          ended_at?: string | null;
        };
        Update: Partial<Omit<Couple, "id" | "created_by" | "created_at">>;
        Relationships: [];
      };
      couple_members: {
        Row: CoupleMember;
        Insert: {
          id?: string;
          couple_id: string;
          user_id: string;
          role?: "member";
          joined_at?: string;
          left_at?: string | null;
        };
        Update: Partial<Omit<CoupleMember, "id" | "couple_id" | "user_id">>;
        Relationships: [];
      };
      checkins: {
        Row: Checkin;
        Insert: {
          id?: string;
          couple_id: string;
          user_id: string;
          checkin_date: string;
          content?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Checkin, "id" | "couple_id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          couple_id: string;
          sender_id: string;
          body: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<Message, "id" | "couple_id" | "sender_id" | "created_at">>;
        Relationships: [];
      };
      calendar_events: {
        Row: CalendarEvent;
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          event_date: string;
          type?: CalendarEvent["type"];
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<CalendarEvent, "id" | "couple_id" | "created_by" | "created_at">>;
        Relationships: [];
      };
      future_letters: {
        Row: Letter;
        Insert: {
          id?: string;
          couple_id: string;
          author_id: string;
          recipient_id?: string | null;
          title?: string;
          body: string;
          unlock_at: string;
          read_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<Letter, "id" | "couple_id" | "author_id" | "created_at">>;
        Relationships: [];
      };
      media_files: {
        Row: MediaFile;
        Insert: {
          id?: string;
          couple_id: string;
          uploader_id: string;
          storage_path: string;
          thumbnail_storage_path?: string | null;
          mime_type: string;
          size_bytes: number;
          caption?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<MediaFile, "id" | "couple_id" | "uploader_id" | "storage_path" | "created_at">>;
        Relationships: [];
      };
      mood_status: {
        Row: MoodStatus;
        Insert: {
          id?: string;
          couple_id: string;
          user_id: string;
          mood: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<MoodStatus, "id" | "couple_id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: {
          id?: string;
          couple_id?: string | null;
          user_id: string;
          actor_id?: string | null;
          type: Notification["type"];
          title: string;
          body?: string | null;
          related_table?: string | null;
          related_id?: string | null;
          read_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Notification, "id" | "user_id" | "actor_id" | "created_at">>;
        Relationships: [];
      };
      push_tokens: {
        Row: PushToken;
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          provider?: PushToken["provider"];
          device_id?: string | null;
          platform: PushToken["platform"];
          app_version?: string | null;
          web_p256dh?: string | null;
          web_auth?: string | null;
          user_agent?: string | null;
          enabled?: boolean;
          last_seen_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<PushToken, "id" | "user_id" | "token" | "created_at">>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreference;
        Insert: {
          user_id: string;
          push_enabled?: boolean;
          message_enabled?: boolean;
          interaction_enabled?: boolean;
          checkin_enabled?: boolean;
          letter_enabled?: boolean;
          calendar_enabled?: boolean;
          quiet_hours_enabled?: boolean;
          quiet_start?: string;
          quiet_end?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<NotificationPreference, "user_id" | "created_at">>;
        Relationships: [];
      };
      push_deliveries: {
        Row: PushDelivery;
        Insert: {
          id?: string;
          notification_id: string;
          user_id: string;
          status?: PushDelivery["status"];
          attempt_count?: number;
          last_error?: string | null;
          expo_ticket_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PushDelivery, "id" | "notification_id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: {
          id?: string;
          couple_id?: string | null;
          reporter_id: string;
          reported_user_id?: string | null;
          reason: string;
          details?: string | null;
          status?: Report["status"];
          created_at?: string;
        };
        Update: Partial<Omit<Report, "id" | "reporter_id" | "created_at">>;
        Relationships: [];
      };
      blocks: {
        Row: Block;
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_user_id: string;
          couple_id?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Block, "id" | "blocker_id" | "blocked_user_id" | "created_at">>;
        Relationships: [];
      };
      account_deletion_requests: {
        Row: AccountDeletionRequest;
        Insert: {
          id?: string;
          user_id: string;
          reason?: string | null;
          status?: AccountDeletionRequest["status"];
          requested_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<Omit<AccountDeletionRequest, "id" | "user_id" | "requested_at">>;
        Relationships: [];
      };
      creation_spaces: {
        Row: CreationSpace;
        Insert: {
          id?: string;
          couple_id: string;
          pet_key?: CreationSpace["pet_key"];
          pet_species?: CreationSpace["pet_species"];
          pet_name?: string;
          pet_mood?: string;
          pet_level?: number;
          growth_points?: number;
          fullness?: number;
          cleanliness?: number;
          affection?: number;
          energy?: number;
          boredom?: number;
          comfort?: number;
          curiosity?: number;
          current_action?: CreationSpace["current_action"];
          personality_seed?: string;
          last_brain_tick_at?: string | null;
          last_ai_response_at?: string | null;
          last_ai_bubble?: string | null;
          last_rig_cue?: Json;
          treat_balance?: number;
          basic_food_count?: number;
          premium_food_count?: number;
          last_fed_food?: CreationSpace["last_fed_food"];
          last_fed_at?: string | null;
          last_played_at?: string | null;
          home_theme?: string;
          decor_slot_1?: string;
          decor_slot_2?: string;
          decor_slot_3?: string;
          last_interaction_at?: string | null;
          last_world_decision?: Json;
          pet_world_surface?: CreationSpace["pet_world_surface"];
          pet_world_state?: CreationSpace["pet_world_state"];
          pet_world_mood?: CreationSpace["pet_world_mood"];
          pet_hidden?: boolean;
          pet_last_seen_at?: string | null;
          pet_last_found_at?: string | null;
          pet_last_surface_changed_at?: string | null;
          pet_sleep_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CreationSpace, "id" | "couple_id" | "created_at">>;
        Relationships: [];
      };
      creation_actions: {
        Row: CreationAction;
        Insert: {
          id?: string;
          couple_id: string;
          actor_id: string;
          action_type: CreationAction["action_type"];
          action_label: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Omit<CreationAction, "id" | "couple_id" | "actor_id" | "created_at">>;
        Relationships: [];
      };
      pet_memories: {
        Row: PetMemory;
        Insert: {
          id?: string;
          couple_id: string;
          memory_type: PetMemory["memory_type"];
          memory_scope?: PetMemory["memory_scope"];
          importance?: number;
          summary: string;
          metadata?: Json;
          expires_at?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<PetMemory, "id" | "couple_id" | "created_at">>;
        Relationships: [];
      };
      pet_ai_generations: {
        Row: PetAiGeneration;
        Insert: {
          id?: string;
          couple_id: string;
          actor_id?: string | null;
          trigger_type: string;
          model?: string | null;
          input_summary?: Json;
          output_json?: Json;
          fallback_used?: boolean;
          error_code?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: Partial<Omit<PetAiGeneration, "id" | "couple_id" | "actor_id" | "created_at">>;
        Relationships: [];
      };
      pet_world_events: {
        Row: PetWorldEvent;
        Insert: {
          id?: string;
          couple_id: string;
          actor_id?: string | null;
          event_type: string;
          surface: string;
          intent?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Omit<PetWorldEvent, "id" | "couple_id" | "actor_id" | "created_at">>;
        Relationships: [];
      };
      couple_footprints: {
        Row: CoupleFootprint;
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          note?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          visited_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<CoupleFootprint, "id" | "couple_id" | "created_by" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_pair_invite: {
        Args: {
          invite_code: string;
          relationship_started_at?: string;
        };
        Returns: {
          couple_id: string;
        }[];
      };
      end_active_couple: {
        Args: Record<PropertyKey, never>;
        Returns: {
          couple_id: string;
        }[];
      };
      update_active_couple_dates: {
        Args: {
          relationship_started_at: string;
        };
        Returns: {
          couple_id: string;
        }[];
      };
      list_letters: {
        Args: Record<PropertyKey, never>;
        Returns: LetterPreview[];
      };
      mark_letter_read: {
        Args: {
          letter_id: string;
        };
        Returns: {
          id: string;
        }[];
      };
      dismiss_letter: {
        Args: {
          letter_id: string;
        };
        Returns: {
          id: string;
        }[];
      };
      delete_letter: {
        Args: {
          letter_id: string;
        };
        Returns: {
          id: string;
        }[];
      };
      mark_notification_read: {
        Args: {
          notification_id: string;
        };
        Returns: {
          id: string;
        }[];
      };
      dismiss_notification: {
        Args: {
          notification_id: string;
        };
        Returns: {
          id: string;
        }[];
      };
      send_quick_interaction: {
        Args: {
          target_couple_id: string;
          interaction_label: string;
        };
        Returns: {
          notification_id: string;
        }[];
      };
      current_user_notification_preferences: {
        Args: Record<string, never>;
        Returns: NotificationPreference;
      };
      register_push_token: {
        Args: {
          push_token: string;
          push_platform: PushToken["platform"];
          push_device_id?: string | null;
          push_app_version?: string | null;
        };
        Returns: PushToken;
      };
      register_web_push_subscription: {
        Args: {
          push_endpoint: string;
          push_p256dh: string;
          push_auth: string;
          push_user_agent?: string | null;
        };
        Returns: PushToken;
      };
      disable_current_push_token: {
        Args: {
          push_token: string;
        };
        Returns: {
          id: string;
        }[];
      };
      block_partner_and_end_couple: {
        Args: {
          reason?: string | null;
        };
        Returns: {
          couple_id: string;
          blocked_user_id: string;
        }[];
      };
      request_account_deletion: {
        Args: {
          reason?: string | null;
        };
        Returns: {
          request_id: string;
        }[];
      };
      ensure_creation_space: {
        Args: {
          target_couple_id: string;
        };
        Returns: CreationSpace[];
      };
      interact_creation_pet: {
        Args: {
          target_couple_id: string;
          interaction_type: "feed" | "pet" | "clean" | "play" | "sleep";
        };
        Returns: CreationSpace[];
      };
      choose_creation_pet: {
        Args: {
          target_couple_id: string;
          chosen_pet_key: CreationSpace["pet_key"];
          chosen_pet_name: string;
        };
        Returns: CreationSpace[];
      };
      buy_creation_food: {
        Args: {
          target_couple_id: string;
          food_type: "basic" | "premium";
          quantity?: number;
        };
        Returns: CreationSpace[];
      };
      feed_creation_pet: {
        Args: {
          target_couple_id: string;
          food_type: "basic" | "premium";
        };
        Returns: CreationSpace[];
      };
      start_creation_pet_sleep: {
        Args: {
          target_couple_id: string;
          sleep_reason?: string;
          sleep_surface?: "home" | "share" | "memory" | "creation_hub" | "pet_room" | null;
        };
        Returns: CreationSpace[];
      };
      refresh_creation_pet_sleep: {
        Args: {
          target_couple_id: string;
        };
        Returns: CreationSpace[];
      };
      settle_creation_pet_sleep: {
        Args: {
          target_couple_id: string;
        };
        Returns: CreationSpace[];
      };
      settle_creation_pet_night_sleep: {
        Args: {
          target_couple_id: string;
        };
        Returns: CreationSpace[];
      };
      claim_creation_game_reward: {
        Args: {
          target_couple_id: string;
          puzzle_id: string;
          solved: boolean;
        };
        Returns: CreationSpace[];
      };
      claim_creation_footprint_reward: {
        Args: {
          target_couple_id: string;
          target_footprint_id: string;
        };
        Returns: CreationSpace[];
      };
      update_creation_home: {
        Args: {
          target_couple_id: string;
          pet_name: string;
          home_theme: string;
          decor_slot_1: string;
          decor_slot_2: string;
          decor_slot_3: string;
        };
        Returns: CreationSpace[];
      };
      prepare_pet_ai_context: {
        Args: {
          target_couple_id: string;
          trigger_type: string;
        };
        Returns: Json;
      };
      apply_pet_ai_decision: {
        Args: {
          target_couple_id: string;
          trigger_type: string;
          decision: Json;
          generation_meta?: Json;
        };
        Returns: CreationSpace[];
      };
      apply_pet_brain_fallback: {
        Args: {
          target_couple_id: string;
          trigger_type: string;
        };
        Returns: CreationSpace[];
      };
      archive_expired_pet_memories: {
        Args: Record<string, never>;
        Returns: number;
      };
      toggle_pet_memory_core: {
        Args: {
          memory_id: string;
          remember: boolean;
        };
        Returns: PetMemory[];
      };
      archive_pet_memory: {
        Args: {
          memory_id: string;
        };
        Returns: PetMemory[];
      };
      apply_pet_world_decision: {
        Args: {
          target_couple_id: string;
          decision: Json;
          generation_meta?: Json;
        };
        Returns: CreationSpace[];
      };
      find_creation_pet: {
        Args: {
          target_couple_id: string;
          surface: string;
        };
        Returns: CreationSpace[];
      };
      summon_creation_pet: {
        Args: {
          target_couple_id: string;
          surface?: string;
        };
        Returns: CreationSpace[];
      };
      mark_pet_surface_seen: {
        Args: {
          target_couple_id: string;
          surface: string;
        };
        Returns: CreationSpace[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
