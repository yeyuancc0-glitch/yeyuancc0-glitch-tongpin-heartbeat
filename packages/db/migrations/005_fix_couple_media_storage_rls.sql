drop policy if exists "couple media insert active member folder" on storage.objects;
create policy "couple media insert active member folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where c.id::text = split_part(storage.objects.name, '/', 1)
      and cm.user_id = auth.uid()
      and cm.left_at is null
      and c.status = 'active'
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
    where mf.storage_path = storage.objects.name
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
)
with check (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where mf.storage_path = storage.objects.name
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
);
