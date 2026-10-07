-- Supabase Cron runs this database-only job; no application secrets are required.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('studysync-expire-referral-rewards','*/5 * * * *','SELECT public.expire_referral_rewards();');
