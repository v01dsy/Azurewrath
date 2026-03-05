// lib/roles.ts

const ROLE_HIERARCHY: Record<string, number> = {
  user:      0,
  mod:       1,
  admin:     2,
  owner:     3,
};

/**
 * Returns true if `role` meets or exceeds the required role level.
 */
export function hasRole(role: string | null | undefined, required: string): boolean {
  const userLevel = ROLE_HIERARCHY[role ?? 'user'] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[required] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Returns true if the current user can delete a given post.
 * Rules:
 *  - Anyone can delete their OWN post (self-delete always allowed)
 *  - To delete someone else's post, your rank must be strictly higher than theirs
 *    AND you must be at least a mod
 */
export function canDeletePost(
  deleterRole: string | null | undefined,
  authorRole: string | null | undefined,
  currentUserId?: string | null,
  authorId?: string | null,
): boolean {
  // Self-delete: always allowed regardless of role
  if (currentUserId && authorId && currentUserId === authorId) return true;

  const deleterRank = ROLE_HIERARCHY[deleterRole ?? 'user'] ?? 0;
  const authorRank  = ROLE_HIERARCHY[authorRole  ?? 'user'] ?? 0;
  return deleterRank >= 1 && deleterRank > authorRank;
}