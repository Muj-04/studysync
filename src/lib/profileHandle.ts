export const PROFILE_HANDLE_MIN_LENGTH = 3;
export const PROFILE_HANDLE_MAX_LENGTH = 24;

const PROFILE_HANDLE_PATTERN = /^[a-z0-9_]+$/;

export function normalizeProfileHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function validateProfileHandle(value: string): string | null {
  const handle = normalizeProfileHandle(value);
  if (handle.length < PROFILE_HANDLE_MIN_LENGTH || handle.length > PROFILE_HANDLE_MAX_LENGTH) {
    return `Handle must be ${PROFILE_HANDLE_MIN_LENGTH}-${PROFILE_HANDLE_MAX_LENGTH} characters.`;
  }
  if (!PROFILE_HANDLE_PATTERN.test(handle)) {
    return 'Use only lowercase letters, numbers, and underscores.';
  }
  return null;
}

export function makeFallbackProfileHandle(label: string | null | undefined, userId: string): string {
  const cleaned = (label ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const base = cleaned.length >= PROFILE_HANDLE_MIN_LENGTH ? cleaned : 'user';
  const suffix = userId.replace(/-/g, '').slice(0, 12);
  return `${base.slice(0, 11)}_${suffix}`;
}
