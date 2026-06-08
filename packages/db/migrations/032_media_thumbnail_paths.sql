alter table public.profiles
  add column if not exists avatar_thumbnail_url text;

alter table public.media_files
  add column if not exists thumbnail_storage_path text;

drop policy if exists "profile avatars read self or active partner" on storage.objects;
create policy "profile avatars read self or active partner"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id::text = split_part(storage.objects.name, '/', 1)
      and (p.avatar_url = storage.objects.name or p.avatar_thumbnail_url = storage.objects.name)
      and (
        p.id = auth.uid()
        or exists (
          select 1
          from public.couple_members cm_self
          join public.couple_members cm_other on cm_other.couple_id = cm_self.couple_id
          join public.couples c on c.id = cm_self.couple_id
          where cm_self.user_id = auth.uid()
            and cm_self.left_at is null
            and cm_other.user_id = p.id
            and cm_other.left_at is null
            and c.status = 'active'
        )
      )
  )
);

drop policy if exists "couple media read active members" on storage.objects;
create policy "couple media read active members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where (mf.storage_path = storage.objects.name or mf.thumbnail_storage_path = storage.objects.name)
      and mf.deleted_at is null
      and public.is_active_couple_member(mf.couple_id)
  )
);

drop policy if exists "couple media update uploader object" on storage.objects;
create policy "couple media update uploader object"
on storage.objects for update
to authenticated
using (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where (mf.storage_path = storage.objects.name or mf.thumbnail_storage_path = storage.objects.name)
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
)
with check (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where (mf.storage_path = storage.objects.name or mf.thumbnail_storage_path = storage.objects.name)
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
);

drop policy if exists "couple media delete uploader object" on storage.objects;
create policy "couple media delete uploader object"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where (mf.storage_path = storage.objects.name or mf.thumbnail_storage_path = storage.objects.name)
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
);
