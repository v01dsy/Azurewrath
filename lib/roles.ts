// lib/roles.ts

const ROLE_HIERARCHY: Record<string, number> = {
  user:      0,
  moderator: 1,
  admin:     2,
  owner:     3,
};

export function hasRole(role: string | null | undefined, required: string): boolean {
  const userLevel = ROLE_HIERARCHY[role ?? 'user'] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[required] ?? 0;
  return userLevel >= requiredLevel;
}

export function canDeletePost(
  deleterRole: string | null | undefined,
  authorRole: string | null | undefined,
): boolean {
  const deleterRank = ROLE_HIERARCHY[deleterRole ?? 'user'] ?? 0;
  const authorRank  = ROLE_HIERARCHY[authorRole  ?? 'user'] ?? 0;
  return deleterRank >= 1 && deleterRank > authorRank;
}