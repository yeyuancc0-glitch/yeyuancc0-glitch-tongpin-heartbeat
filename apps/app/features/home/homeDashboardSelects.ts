export const profileDashboardSelect = "id,display_name,avatar_url,avatar_thumbnail_url,birthdate,created_at,updated_at";

export const activeCoupleDashboardSelect =
  "id,started_at,anniversary_date,status,created_by,created_at,ended_at,couple_members(id,couple_id,user_id,role,joined_at,left_at,profile:profiles(id,display_name,avatar_url,avatar_thumbnail_url,birthdate,created_at,updated_at))";

export const messageDashboardSelect =
  "id,couple_id,sender_id,body,created_at,updated_at,deleted_at,sender:profiles(id,display_name,avatar_url,avatar_thumbnail_url,birthdate,created_at,updated_at)";

export const pairInviteDashboardSelect = "id,code,created_by,accepted_by,status,expires_at,created_at,accepted_at";

export const checkinDashboardSelect = "id,couple_id,user_id,checkin_date,content,created_at,updated_at,deleted_at";

export const calendarEventDashboardSelect = "id,couple_id,created_by,title,event_date,type,note,created_at,updated_at,deleted_at";

export const mediaFileDashboardSelect =
  "id,couple_id,uploader_id,storage_path,thumbnail_storage_path,mime_type,size_bytes,caption,created_at,updated_at,deleted_at";

export const moodStatusDashboardSelect = "id,couple_id,user_id,mood,note,created_at,updated_at";

export const notificationDashboardSelect =
  "id,couple_id,user_id,actor_id,type,title,body,related_table,related_id,read_at,dismissed_at,created_at";

export const creationActionDashboardSelect = "id,couple_id,actor_id,action_type,action_label,metadata,created_at";

export const petMemoryDashboardSelect =
  "id,couple_id,memory_type,memory_scope,importance,summary,metadata,expires_at,archived_at,created_by,created_at";

export const footprintDashboardSelect = "id,couple_id,created_by,title,note,latitude,longitude,visited_at,created_at,updated_at,deleted_at";
