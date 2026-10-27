-- Staging only, submit as one execution or use psql ON_ERROR_STOP=1.
BEGIN;
DO $test$
DECLARE
  caller uuid := gen_random_uuid();
  target uuid := gen_random_uuid();
  marker text := 'audit_'||replace(gen_random_uuid()::text,'-','');
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  VALUES(caller,'rpc-check-'||caller||'@example.invalid',now(),'{}'),
        (target,'rpc-check-'||target||'@example.invalid',now(),'{}');
  UPDATE public.profiles SET username=marker WHERE id=target;
  PERFORM set_config('request.jwt.claim.sub',caller::text,true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS(SELECT 1 FROM public.search_users(marker) WHERE id=target) THEN
    RAISE EXCEPTION 'Public username search broken';
  END IF;
  IF EXISTS(SELECT 1 FROM public.search_users(marker) WHERE id=target AND coalesce(email,'') <> '') THEN
    RAISE EXCEPTION 'Search exposes another account email';
  END IF;
  RESET ROLE;
  IF has_function_privilege('anon','public.search_users(text)','EXECUTE')
    OR has_function_privilege('anon','public.close_expired_rooms()','EXECUTE')
    OR has_function_privilege('authenticated','public.close_expired_rooms()','EXECUTE')
    OR has_function_privilege('anon','public.delete_user_account(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.delete_user_account(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Private or maintenance RPC grants too broad';
  END IF;
  IF NOT has_function_privilege('service_role','public.close_expired_rooms()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.delete_user_account(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Maintenance service access broken';
  END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: public username searchable without account email disclosure; fixtures rolled back' AS result;
