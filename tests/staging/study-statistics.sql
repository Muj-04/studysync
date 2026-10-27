-- Staging only; proves own-data access and cross-user isolation under real roles.
BEGIN;
DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  doc text := gen_random_uuid()::text;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    VALUES(owner_id,'release-check-'||owner_id||'@example.invalid',now(),'{}'),
          (stranger_id,'release-check-'||stranger_id||'@example.invalid',now(),'{}');
  INSERT INTO public.documents(id,user_id,name) VALUES(doc,owner_id,'Synthetic study check');
  INSERT INTO public.study_sessions(user_id,document_id,started_at,ended_at,duration_seconds)
    VALUES(owner_id,doc,date_trunc('day',now()),date_trunc('day',now())+interval '1 minute',60);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  SET LOCAL ROLE authenticated;
  IF public.get_today_study_seconds(owner_id) IS DISTINCT FROM 60
    OR public.get_study_streak(owner_id) IS DISTINCT FROM 1
    OR (SELECT total_seconds FROM public.get_study_time_map(owner_id,ARRAY[doc])) IS DISTINCT FROM 60::bigint THEN
    RAISE EXCEPTION 'Owner cannot read own statistics';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',stranger_id::text,true);
  SET LOCAL ROLE authenticated;
  IF public.get_today_study_seconds(owner_id) IS DISTINCT FROM 0
    OR public.get_study_streak(owner_id) IS DISTINCT FROM 0
    OR EXISTS(SELECT 1 FROM public.get_study_time_map(owner_id,ARRAY[doc])) THEN
    RAISE EXCEPTION 'Study statistics leaked across users';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','',true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.get_today_study_seconds(owner_id);
    RAISE EXCEPTION 'Anonymous statistics RPC was executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_study_streak(owner_id);
    RAISE EXCEPTION 'Anonymous streak RPC was executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_study_time_map(owner_id,ARRAY[doc]);
    RAISE EXCEPTION 'Anonymous time-map RPC was executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $test$;
ROLLBACK;
SELECT 'PASS: statistics owner access, cross-user isolation, anonymous denial; fixtures rolled back' AS result;
