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
  avatar_signed_url?: string | null;
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
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  signedUrl?: string | null;
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
  treat_balance: number;
  basic_food_count: number;
  premium_food_count: number;
  last_fed_food: "basic" | "premium" | null;
  home_theme: string;
  decor_slot_1: string;
  decor_slot_2: string;
  decor_slot_3: string;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreationAction = {
  id: string;
  couple_id: string;
  actor_id: string;
  action_type: "feed" | "pet" | "clean" | "rename" | "decorate" | "choose_pet" | "buy_food" | "game_reward" | "footprint_add" | "footprint_update" | "footprint_delete";
  action_label: string;
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
          treat_balance?: number;
          basic_food_count?: number;
          premium_food_count?: number;
          last_fed_food?: CreationSpace["last_fed_food"];
          home_theme?: string;
          decor_slot_1?: string;
          decor_slot_2?: string;
          decor_slot_3?: string;
          last_interaction_at?: string | null;
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
          interaction_type: "feed" | "pet" | "clean";
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
      claim_creation_game_reward: {
        Args: {
          target_couple_id: string;
          puzzle_id: string;
          solved: boolean;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
