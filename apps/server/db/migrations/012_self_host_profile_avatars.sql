create table if not exists public.profile_avatar_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  thumbnail_storage_path text unique,
  mime_type text not null,
  size_bytes integer not null,
  thumbnail_mime_type text,
  thumbnail_size_bytes integer,
  upload_status text not null default 'pending',
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (upload_status in ('pending', 'ready', 'deleted')),
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (size_bytes > 0 and size_bytes <= 4194304),
  check (thumbnail_mime_type is null or thumbnail_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (thumbnail_size_bytes is null or (thumbnail_size_bytes > 0 and thumbnail_size_bytes <= 1048576)),
  check ((thumbnail_storage_path is null and thumbnail_mime_type is null and thumbnail_size_bytes is null) or (thumbnail_storage_path is not null and thumbnail_mime_type is not null and thumbnail_size_bytes is not null)),
  check (storage_path like (user_id::text || '/%')),
  check (thumbnail_storage_path is null or thumbnail_storage_path like (user_id::text || '/%'))
);

drop trigger if exists profile_avatar_uploads_set_updated_at on public.profile_avatar_uploads;
create trigger profile_avatar_uploads_set_updated_at
before update on public.profile_avatar_uploads
for each row execute function public.set_updated_at();

create index if not exists profile_avatar_uploads_user_status_idx
  on public.profile_avatar_uploads(user_id, upload_status, created_at desc);
