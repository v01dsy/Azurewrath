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

/**
 * Returns true if `deleterRole` is allowed to delete a post written by `authorRole`.
 * Rules:
 *  - Must be at least moderator to delete anything
 *  - Can only delete posts written by someone with a strictly lower rank
 *    (mods can't delete admin/owner posts, admins can't delete owner posts)
 */
export function canDeletePost(
  deleterRole: string | null | undefined,
  authorRole: string | null | undefined,
): boolean {
  const deleterRank = ROLE_HIERARCHY[deleterRole ?? 'user'] ?? 0;
  const authorRank  = ROLE_HIERARCHY[authorRole  ?? 'user'] ?? 0;
  return deleterRank >= 1 && deleterRank > authorRank;
}