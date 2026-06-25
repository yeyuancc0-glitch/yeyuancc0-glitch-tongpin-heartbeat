alter table public.pet_memories
  drop constraint if exists pet_memories_importance_check;

alter table public.pet_memories
  add constraint pet_memories_importance_check
  check (importance between 0 and 100);
