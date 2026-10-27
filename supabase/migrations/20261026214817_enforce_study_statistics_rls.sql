-- Statistics are private study data; evaluate the existing ownership RLS as caller.
-- Preserve function signatures and aggregation behavior used by the browser.
ALTER FUNCTION public.get_study_streak(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_study_time_map(uuid,text[]) SECURITY INVOKER;
ALTER FUNCTION public.get_today_study_seconds(uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.get_study_streak(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_study_time_map(uuid,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_today_study_seconds(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_study_streak(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_study_time_map(uuid,text[]) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_today_study_seconds(uuid) TO authenticated,service_role;
