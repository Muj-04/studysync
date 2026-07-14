create or replace function public.increment_ai_usage(p_user_id uuid, p_month text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.ai_usage (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set count = public.ai_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

revoke all on function public.increment_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid, text) to service_role;
