export type Plan = 'free' | 'premium' | 'pro';

// The database enforces the same numbers (public.plan_limits, migration
// 20261128020000_plan_limits). tests/plan-limits-db.test.cjs fails if they drift.
export interface PlanLimits {
  documents:          number;
  /** Voice notes + shared room PDFs, one total per account. */
  storageBytes:       number;
  aiRequestsPerMonth: number;
  aiRequestsPerDay:   number;
  canCreateRooms:     boolean;
  maxRoomMembers:     number;
}

export const PLAN_LIMITS = {
  free: {
    documents:          3,
    storageBytes:       30 * 1024 * 1024,               // 30 MB
    aiRequestsPerMonth: 15,
    aiRequestsPerDay:   5,
    canCreateRooms:     false,
    maxRoomMembers:     0,
  },
  premium: {
    documents:          Infinity,
    storageBytes:       1 * 1024 * 1024 * 1024,         // 1 GB
    aiRequestsPerMonth: 300,
    aiRequestsPerDay:   40,
    canCreateRooms:     true,
    maxRoomMembers:     5,
  },
  pro: {
    documents:          Infinity,
    storageBytes:       5 * 1024 * 1024 * 1024,         // 5 GB
    aiRequestsPerMonth: 1000,
    aiRequestsPerDay:   100,
    canCreateRooms:     true,
    maxRoomMembers:     20,
  },
} as const satisfies Record<Plan, PlanLimits>;

// VIP bypasses every plan limit. Single source of truth so callsites can
// just look up `effectivePlanLimits(plan, isVip).x` instead of repeating
// `isVip ? Infinity : PLAN_LIMITS[plan].x` (which is easy to forget).
const VIP_LIMITS: PlanLimits = {
  documents:          Infinity,
  storageBytes:       Infinity,
  aiRequestsPerMonth: Infinity,
  aiRequestsPerDay:   Infinity,
  canCreateRooms:     true,
  maxRoomMembers:     20,
};

export function effectivePlanLimits(plan: Plan, isVip: boolean): PlanLimits {
  return isVip ? VIP_LIMITS : PLAN_LIMITS[plan];
}

// Human-readable labels used in UI messages
export const PLAN_LABELS: Record<Plan, string> = {
  free:    'Free',
  premium: 'Premium',
  pro:     'Pro',
};

export const STORAGE_LABELS: Record<Plan, string> = {
  free:    '30 MB',
  premium: '1 GB',
  pro:     '5 GB',
};

/** Rooms close this many hours after creation (enforced by the database too). */
export const ROOM_DURATION_HOURS = 6;

// Returns the plan the user should upgrade to, or null if already at highest paid tier.
export function nextUpgradePlan(plan: Plan): Plan | null {
  if (plan === 'free')    return 'premium';
  if (plan === 'premium') return 'pro';
  return null;
}
