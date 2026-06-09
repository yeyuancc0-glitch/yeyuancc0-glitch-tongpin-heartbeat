revoke execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) to service_role;
