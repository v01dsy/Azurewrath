// lib/roles.ts

const ROLE_HIERARCHY: Record<string, number> = {
  user:      0,
  moderator: 1,
  admin:     2,
  owner:     3,
};

/**
 * Returns true if `role` meets or exceeds the required role level.
 * e.g. hasRole('owner', 'admin') → true
 *      hasRole('moderator', 'admin') → false
 */
export function hasRole(role: string | null | undefined, required: string): boolean {
  const userLevel = ROLE_HIERARCHY[role ?? 'user'] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[required] ?? 0;
  return userLevel >= requiredLevel;
}