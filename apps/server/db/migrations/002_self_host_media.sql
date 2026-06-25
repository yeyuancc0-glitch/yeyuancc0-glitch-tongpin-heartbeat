create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_active_couple_member(target_couple_id uuid, target_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.couple_members cm
      join public.couples c on c.id = cm.couple_id
     where cm.couple_id = target_couple_id
       and cm.user_id = target_user_id
       and cm.status = 'active'
       and c.status = 'active'
  );
$$;

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  thumbnail_storage_path text unique,
  mime_type text not null,
  size_bytes bigint not null,
  caption text,
  upload_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (upload_status in ('pending', 'ready', 'deleted')),
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (size_bytes > 0 and size_bytes <= 8388608),
  check (storage_path = lower(storage_path)),
  check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|gif)$'),
  check (thumbnail_storage_path is null or thumbnail_storage_path = lower(thumbnail_storage_path)),
  check (thumbnail_storage_path is null or thumbnail_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}-thumb[.](jpg|jpeg|png|webp|gif)$'),
  check ((upload_status = 'deleted' and deleted_at is not null) or upload_status <> 'deleted')
);

create index if not exists media_files_couple_created_idx
  on public.media_files(couple_id, created_at desc)
  where deleted_at is null;

create index if not exists media_files_uploader_created_idx
  on public.media_files(uploader_id, created_at desc)
  where deleted_at is null;

drop trigger if exists media_files_set_updated_at on public.media_files;
create trigger media_files_set_updated_at
before update on public.media_files
for each row execute function public.set_updated_at();
