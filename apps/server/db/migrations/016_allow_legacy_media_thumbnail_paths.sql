alter table public.media_files
  drop constraint if exists media_files_thumbnail_storage_path_shape_check;

alter table public.media_files
  add constraint media_files_thumbnail_storage_path_shape_check
  check (
    thumbnail_storage_path is null
    or thumbnail_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}-thumb[.](jpg|jpeg|png|webp|gif)$'
    or thumbnail_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/thumbs/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|gif)$'
  );
