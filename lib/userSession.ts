//lib/userSession.ts
export function setUserSession(user: unknown) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('robloxUser', JSON.stringify(user));
  }
}

export function getUserSession() {
  if (typeof window !== 'undefined') {
    const user = localStorage.getItem('robloxUser');
    if (user) return JSON.parse(user);
  }
  return null;
}

export function clearUserSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('robloxUser');
  }
}
