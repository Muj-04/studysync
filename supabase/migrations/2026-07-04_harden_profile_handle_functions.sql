alter function public.is_handle_available(text) security invoker;
revoke all on function public.handle_new_user() from public, anon, authenticated;
