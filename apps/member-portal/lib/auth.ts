export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rrr_token');
}

export function getMemberId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rrr_member_id');
}

export function redirectToLogin(): void {
  const loginUrl = process.env.NEXT_PUBLIC_ACCOUNTS_ZONE_URL ?? '';
  if (typeof window !== 'undefined') {
    window.location.href = loginUrl
      ? `${loginUrl}?redirect=${encodeURIComponent(window.location.href)}`
      : '/';
  }
}

export function requireAuth(): { token: string; memberId: string } | null {
  const token = getToken();
  const memberId = getMemberId();
  if (!token || !memberId) {
    redirectToLogin();
    return null;
  }
  return { token, memberId };
}
