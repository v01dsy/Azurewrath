// lib/permissions.ts

export const ROLE_PERMISSIONS = {
  user:      [] as const,
  moderator: ['toggle_manipulated'] as const,
  admin:     ['toggle_manipulated', 'manage_users', 'manage_items'] as const,
} as const;

export type Role = keyof typeof ROLE_PERMISSIONS;
export type Permission = 'toggle_manipulated' | 'manage_users' | 'manage_items';

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return (perms as readonly string[]).includes(permission);
}