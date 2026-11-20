-- Run only on staging as postgres. All fixtures and changes are rolled back.
BEGIN;
DO $test$
DECLARE
  uid uuid;
  state text;
  reservation uuid;
BEGIN
  FOREACH state IN ARRAY ARRAY['canceled','unpaid','paused','incomplete_expired'] LOOP
    uid := gen_random_uuid();
    INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      VALUES(uid,'release-check-'||uid||'@example.invalid',now(),'{}');
    UPDATE public.profiles SET referral_expires_at=now()+interval '7 days' WHERE id=uid;
    PERFORM public.apply_billing_event('active-'||uid,1,uid,'premium','cus-'||uid,'sub-'||uid,'active');
    PERFORM public.apply_billing_event('loss-'||uid,2,uid,NULL,'cus-'||uid,'sub-'||uid,state);
    IF (SELECT plan FROM public.profiles WHERE id=uid) IS DISTINCT FROM 'premium' THEN
      RAISE EXCEPTION 'Unexpired referral lost for %',state;
    END IF;
    IF (SELECT plan FROM public.subscriptions WHERE user_id=uid) IS DISTINCT FROM 'free' THEN
      RAISE EXCEPTION 'Subscription entitlement not removed for %',state;
    END IF;
    -- Duplicate and older events must not overwrite the committed state.
    PERFORM public.apply_billing_event('loss-'||uid,2,uid,'pro','cus-'||uid,'sub-'||uid,'active');
    PERFORM public.apply_billing_event('older-'||uid,0,uid,'pro','cus-'||uid,'sub-'||uid,'active');
    IF (SELECT status FROM public.subscriptions WHERE user_id=uid) IS DISTINCT FROM state THEN
      RAISE EXCEPTION 'Duplicate/stale event overwrote state';
    END IF;
    UPDATE public.profiles SET referral_expires_at=now()-interval '1 minute' WHERE id=uid;
    PERFORM public.expire_referral_rewards();
    IF (SELECT plan FROM public.profiles WHERE id=uid) IS DISTINCT FROM 'free' THEN
      RAISE EXCEPTION 'Expired referral retained entitlement';
    END IF;
  END LOOP;

  -- The last fixture is also an isolated quota owner.
  reservation := public.reserve_ai_request_v2(uid,'release-check',1);
  IF reservation IS NULL OR public.reserve_ai_request_v2(uid,'release-check',1) IS NOT NULL THEN
    RAISE EXCEPTION 'Quota limit not enforced';
  END IF;
  PERFORM public.refund_ai_request(reservation);
  PERFORM public.refund_ai_request(reservation);
  IF (SELECT count FROM public.ai_usage WHERE user_id=uid AND month='release-check') <> 0 THEN
    RAISE EXCEPTION 'Refund not idempotent';
  END IF;
  reservation := public.reserve_ai_request_v2(uid,'release-check',1);
  UPDATE public.ai_request_reservations SET expires_at=now()-interval '1 minute' WHERE id=reservation;
  IF public.complete_ai_request(reservation) THEN RAISE EXCEPTION 'Expired request completed'; END IF;
  IF public.reconcile_ai_requests(uid) <> 1 THEN RAISE EXCEPTION 'Expired request not reconciled'; END IF;
  reservation := public.reserve_ai_request_v2(uid,'release-check',1);
  IF NOT public.complete_ai_request(reservation) OR NOT public.complete_ai_request(reservation) THEN
    RAISE EXCEPTION 'Completion not idempotent';
  END IF;
  PERFORM public.refund_ai_request(reservation);
  IF (SELECT count FROM public.ai_usage WHERE user_id=uid AND month='release-check') <> 1 THEN
    RAISE EXCEPTION 'Completed request refunded';
  END IF;

  FOREACH state IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(state,'public.apply_billing_event(text,bigint,uuid,text,text,text,text)','EXECUTE')
      OR has_function_privilege(state,'public.reserve_ai_request_v2(uuid,text,integer)','EXECUTE')
      OR has_function_privilege(state,'public.expire_referral_rewards()','EXECUTE') THEN
      RAISE EXCEPTION 'Privileged RPC accessible by %',state;
    END IF;
  END LOOP;
END $test$;
ROLLBACK;
SELECT 'PASS: billing referral preservation, expiry, event ordering, quota lifecycle, RPC grants; fixtures rolled back' AS result;
