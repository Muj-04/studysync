create or replace function public.normalize_profile_handle(input text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9_]+', '', 'g'))
$$;

alter table public.profiles add column if not exists handle text;

update public.profiles
set handle = left(
  case when length(public.normalize_profile_handle(username)) >= 3
    then public.normalize_profile_handle(username) else 'user' end,
  11
) || '_' || substr(replace(id::text, '-', ''), 1, 12)
where handle is null
   or handle <> public.normalize_profile_handle(handle)
   or length(handle) not between 3 and 24;

alter table public.profiles alter column handle set not null;
alter table public.profiles drop constraint if exists profiles_handle_format;
alter table public.profiles add constraint profiles_handle_format check (
  handle = lower(handle) and handle ~ '^[a-z0-9_]{3,24}$'
);
create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle));

create or replace function public.is_handle_available(p_handle text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    p_handle = public.normalize_profile_handle(p_handle)
    and length(p_handle) between 3 and 24
    and not exists (
      select 1
      from public.profiles
      where handle = p_handle
        and id is distinct from auth.uid()
    ),
    false
  )
$$;
revoke all on function public.is_handle_available(text) from public;
grant execute on function public.is_handle_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_handle text;
  generated_base text;
  final_handle text;
begin
  requested_handle := nullif(trim(new.raw_user_meta_data->>'handle'), '');
  if requested_handle is not null then
    final_handle := public.normalize_profile_handle(requested_handle);
    if final_handle <> lower(requested_handle) or length(final_handle) not between 3 and 24 then
      raise exception 'Invalid account handle' using errcode = '23514';
    end if;
  else
    generated_base := public.normalize_profile_handle(coalesce(
      nullif(new.raw_user_meta_data->>'preferred_username', ''),
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ));
    if length(generated_base) < 3 then generated_base := 'user'; end if;
    final_handle := left(generated_base, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (id, username, handle, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    final_handle,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data->>'picture'), '')
    )
  );
  return new;
exception when unique_violation then
  raise exception 'This account handle is already taken' using errcode = '23505';
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
