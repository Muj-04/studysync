-- Staging only, as postgres; submit atomically or use psql ON_ERROR_STOP=1.
-- Apply the reconciliation migration before this script. To test the migration
-- transactionally, place its statements immediately after BEGIN below.
-- Lease contention is exercised sequentially; this is not a two-session race test.
BEGIN;
DO $test$
DECLARE
  uid uuid := gen_random_uuid();
  sub_id text := 'sub-reconcile-check-'||gen_random_uuid();
  customer_id text := 'cus-reconcile-check-'||gen_random_uuid();
  marker text := 'reconcile-check-'||gen_random_uuid();
  lease_token uuid;
  stale_token uuid;
  claim jsonb;
  state text;
  role_name text;
  signature text;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    VALUES(uid,'billing-reconcile-check-'||uid||'@example.invalid',now(),'{}');
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid) THEN
    RAISE EXCEPTION 'Profile trigger did not provision fixture';
  END IF;
  UPDATE public.profiles SET referral_expires_at=now()+interval '7 days' WHERE id=uid;

  FOREACH signature IN ARRAY ARRAY[
    'public.claim_billing_reconciliation(text,text)',
    'public.release_billing_reconciliation(text,uuid)',
    'public.commit_billing_reconciliation(text,bigint,uuid,text,text,text,text,uuid,bigint)'
  ] LOOP
    IF NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Service execution missing: %',signature;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN
        RAISE EXCEPTION 'Privileged function exposed to %: %',role_name,signature;
      END IF;
    END LOOP;
  END LOOP;
  IF has_function_privilege('service_role',
    'public.apply_billing_event(text,bigint,uuid,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Legacy snapshot writer can bypass reconciliation';
  END IF;

  -- Actual service-role calls, not only grant inspection. All three snapshots
  -- have the same event timestamp; their inputs represent successive Stripe reads.
  FOREACH state IN ARRAY ARRAY['active','paused','active'] LOOP
    SET LOCAL ROLE service_role;
    claim := public.claim_billing_reconciliation(sub_id,marker);
    lease_token := (claim->>'token')::uuid;
    IF lease_token IS NULL THEN RAISE EXCEPTION 'Missing reconciliation lease'; END IF;
    PERFORM public.commit_billing_reconciliation(marker,100,uid,'premium',customer_id,sub_id,state,lease_token,50);
    PERFORM public.release_billing_reconciliation(sub_id,lease_token);
    claim := public.claim_billing_reconciliation(sub_id,marker);
    IF claim->>'processed' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Committed duplicate was not deduplicated';
    END IF;
    RESET ROLE;
    IF (SELECT status FROM public.subscriptions WHERE user_id=uid) IS DISTINCT FROM state THEN
      RAISE EXCEPTION 'Same-second authoritative status failed: %',state;
    END IF;
    IF (SELECT plan FROM public.subscriptions WHERE user_id=uid)
      IS DISTINCT FROM (CASE WHEN state='paused' THEN 'free' ELSE 'premium' END) THEN
      RAISE EXCEPTION 'Subscription entitlement incorrect: %',state;
    END IF;
    IF (SELECT plan FROM public.profiles WHERE id=uid) IS DISTINCT FROM 'premium' THEN
      RAISE EXCEPTION 'Active referral entitlement was lost: %',state;
    END IF;
    marker := 'reconcile-check-'||gen_random_uuid();
  END LOOP;

  claim := public.claim_billing_reconciliation(sub_id,marker||'-stalled');
  stale_token := (claim->>'token')::uuid;
  BEGIN
    PERFORM public.claim_billing_reconciliation(sub_id,marker||'-contended');
    RAISE EXCEPTION 'Live lease did not reject contention';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Billing reconciliation busy; retry' THEN RAISE; END IF;
  END;
  UPDATE public.billing_reconciliation_leases
    SET expires_at=clock_timestamp()-interval '1 second' WHERE subscription_id=sub_id;
  claim := public.claim_billing_reconciliation(sub_id,marker||'-replacement');
  lease_token := (claim->>'token')::uuid;
  IF lease_token IS NULL OR lease_token=stale_token THEN RAISE EXCEPTION 'Expired lease was not replaced'; END IF;
  PERFORM public.release_billing_reconciliation(sub_id,stale_token);
  IF NOT EXISTS(SELECT 1 FROM public.billing_reconciliation_leases WHERE subscription_id=sub_id AND billing_reconciliation_leases.token=lease_token) THEN
    RAISE EXCEPTION 'Stale cleanup deleted replacement lease';
  END IF;
  BEGIN
    PERFORM public.commit_billing_reconciliation(marker||'-stalled',100,uid,'pro',customer_id,sub_id,'active',stale_token,50);
    RAISE EXCEPTION 'Expired worker committed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Billing reconciliation lease lost' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.billing_events WHERE event_id=marker||'-stalled') THEN
    RAISE EXCEPTION 'Rejected worker left a receipt';
  END IF;
  PERFORM public.commit_billing_reconciliation(marker||'-replacement',100,uid,'premium',customer_id,sub_id,'paused',lease_token,50);
  PERFORM public.release_billing_reconciliation(sub_id,lease_token);

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
    BEGIN
      PERFORM public.claim_billing_reconciliation(sub_id,marker||'-attack');
      RAISE EXCEPTION 'Unprivileged claim succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.commit_billing_reconciliation(marker||'-attack',100,uid,'pro',customer_id,sub_id,'active',lease_token,50);
      RAISE EXCEPTION 'Unprivileged commit succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.release_billing_reconciliation(sub_id,lease_token);
      RAISE EXCEPTION 'Unprivileged release succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.billing_reconciliation_leases WHERE subscription_id=sub_id) THEN
    RAISE EXCEPTION 'Completed fixture retained a lease';
  END IF;
END $test$;
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'billing-reconcile-check-%@example.invalid')
    OR EXISTS(SELECT 1 FROM public.subscriptions WHERE stripe_subscription_id LIKE 'sub-reconcile-check-%')
    OR EXISTS(SELECT 1 FROM public.billing_events WHERE event_id LIKE 'reconcile-check-%') THEN
    RAISE EXCEPTION 'Billing reconciliation fixtures remain after rollback';
  END IF;
END $cleanup$;
SELECT 'PASS: same-second recovery, referral preservation, lease fencing, service-only RPCs; fixtures rolled back' AS result;
