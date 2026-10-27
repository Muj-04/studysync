-- Staging only; each fixture and all function effects roll back.
BEGIN;
DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  doc text := gen_random_uuid()::text;
  note text := gen_random_uuid()::text;
  room uuid;
  rows jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    VALUES(owner_id,'release-check-'||owner_id||'@example.invalid',now(),'{}'),
          (stranger_id,'release-check-'||stranger_id||'@example.invalid',now(),'{}');
  INSERT INTO public.documents(id,user_id,name) VALUES(doc,owner_id,'Synthetic collection check');
  rows := jsonb_build_array(jsonb_build_object('id',note,'user_id',stranger_id,'document_id','spoof',
    'page_key','wrong','x',0,'y',0,'width',100,'height',50,'content','kept','font_size',13,'color','#000000'));
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.replace_study_collection('text_notes',doc,'1',rows);
  IF NOT EXISTS(SELECT 1 FROM public.text_notes WHERE id=note AND user_id=owner_id
      AND document_id=doc AND page_key='1' AND content='kept') THEN
    RAISE EXCEPTION 'Collection scope spoofing or replacement failure';
  END IF;
  BEGIN
    PERFORM public.replace_study_collection('text_notes',doc,'1','[{"content":"invalid"}]');
    RAISE EXCEPTION 'Invalid collection accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.text_notes WHERE id=note AND content='kept') THEN
    RAISE EXCEPTION 'Failed replacement destroyed previous notes';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',stranger_id::text,true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT 1 FROM public.text_notes WHERE id=note) THEN RAISE EXCEPTION 'Cross-user note read'; END IF;
  BEGIN
    PERFORM public.replace_study_collection('text_notes',doc,'1','[]');
    RAISE EXCEPTION 'Cross-user replacement accepted' USING ERRCODE='23514';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM public.text_notes WHERE id=note) THEN RAISE EXCEPTION 'Cross-user deletion'; END IF;

  INSERT INTO public.study_rooms(host_user_id,document_name,pdf_path)
    VALUES(owner_id,'Synthetic room','synthetic/check.pdf') RETURNING id INTO room;
  INSERT INTO public.room_members(room_id,user_id) VALUES(room,owner_id),(room,stranger_id);
  IF public.leave_room_atomic(room,owner_id) THEN RAISE EXCEPTION 'Occupied room closed'; END IF;
  IF (SELECT status FROM public.study_rooms WHERE id=room) <> 'active' THEN RAISE EXCEPTION 'Occupied room inactive'; END IF;
  IF public.leave_room_atomic(room,owner_id) THEN RAISE EXCEPTION 'Duplicate leave closed room'; END IF;
  IF NOT public.leave_room_atomic(room,stranger_id) THEN RAISE EXCEPTION 'Empty room not closed'; END IF;
  IF (SELECT status FROM public.study_rooms WHERE id=room) <> 'closed' THEN RAISE EXCEPTION 'Empty room active'; END IF;
  IF has_function_privilege('authenticated','public.leave_room_atomic(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can supply arbitrary leaving identity';
  END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: note ownership, atomic rollback, room leave lifecycle, RPC grant; fixtures rolled back' AS result;
