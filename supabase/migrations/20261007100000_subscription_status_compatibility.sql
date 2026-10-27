-- The deployed table originally allowed only active/canceled/past_due/trialing.
-- Preserve valid Stripe states so webhook updates and entitlement changes commit together.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (
  status IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
);
