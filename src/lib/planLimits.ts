export type Plan = 'free' | 'premium' | 'pro';

export const PLAN_LIMITS = {
  free: {
    documents:          3,
    voiceStorageBytes:  30 * 1024 * 1024,               // 30 MB
    aiRequestsPerMonth: 15,
    canCreateRooms:     false,
    maxRoomMembers:     0,
  },
  premium: {
    documents:          Infinity,
    voiceStorageBytes:  1 * 1024 * 1024 * 1024,         // 1 GB
    aiRequestsPerMonth: 300,
    canCreateRooms:     true,
    maxRoomMembers:     5,
  },
  pro: {
    documents:          Infinity,
    voiceStorageBytes:  5 * 1024 * 1024 * 1024,         // 5 GB
    aiRequestsPerMonth: 1000,
    canCreateRooms:     true,
    maxRoomMembers:     20,
  },
} as const satisfies Record<Plan, {
  documents:          number;
  voiceStorageBytes:  number;
  aiRequestsPerMonth: number;
  canCreateRooms:     boolean;
  maxRoomMembers:     number;
}>;

// Human-readable labels used in UI messages
export const PLAN_LABELS: Record<Plan, string> = {
  free:    'Free',
  premium: 'Premium',
  pro:     'Pro',
};

export const VOICE_STORAGE_LABELS: Record<Plan, string> = {
  free:    '30 MB',
  premium: '1 GB',
  pro:     '5 GB',
};

// Returns the plan the user should upgrade to, or null if already at highest paid tier.
export function nextUpgradePlan(plan: Plan): Plan | null {
  if (plan === 'free')    return 'premium';
  if (plan === 'premium') return 'pro';
  return null;
}
