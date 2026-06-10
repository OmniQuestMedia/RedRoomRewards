const API_BASE = process.env.NEXT_PUBLIC_RRR_API_URL ?? 'http://localhost:3000/api/v1';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rrr_token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const loginUrl = process.env.NEXT_PUBLIC_ACCOUNTS_ZONE_URL ?? '';
    if (typeof window !== 'undefined' && loginUrl) {
      window.location.href = `${loginUrl}?redirect=${encodeURIComponent(window.location.href)}`;
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface BalanceResponse {
  memberId: string;
  totalPoints: number;
  promotionalBalance: number;
  tier: string;
}

export interface Transaction {
  entryId: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  timestamp: string;
  correlationId?: string;
}

export interface TransactionHistoryResponse {
  entries: Transaction[];
  total: number;
  page: number;
}

export interface CatalogueItem {
  item_id: string;
  tenant_id: string;
  title: string;
  description: string;
  image_url?: string;
  points_cost: number;
  inventory_count: number | null;
  redemption_type: 'DISCOUNT_CODE' | 'FREE_PRODUCT' | 'EXCLUSIVE_ACCESS';
  redemption_value: Record<string, unknown>;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface CatalogueResponse {
  items: CatalogueItem[];
  total: number;
  page: number;
  limit: number;
}

export interface RedeemResponse {
  redemptionId: string;
  redemptionCode: string;
  pointsSpent: number;
  itemTitle: string;
}

export interface Redemption {
  redemption_id: string;
  catalogue_item_id: string;
  points_spent: number;
  redemption_code: string;
  status: 'PENDING' | 'FULFILLED' | 'EXPIRED' | 'REVERSED';
  createdAt: string;
}

export interface EarnRule {
  trigger: string;
  points: string;
  notes: string;
}

export async function getBalance(memberId: string): Promise<BalanceResponse> {
  return apiFetch<BalanceResponse>(`/members/${memberId}/balance`);
}

export async function getTransactionHistory(
  memberId: string,
  page = 1,
): Promise<TransactionHistoryResponse> {
  return apiFetch<TransactionHistoryResponse>(
    `/ledger/transactions?accountId=${encodeURIComponent(memberId)}&page=${page}`,
  );
}

export async function getCatalogue(
  filters: { redemption_type?: string; max_points_cost?: number } = {},
): Promise<CatalogueResponse> {
  const params = new URLSearchParams();
  if (filters.redemption_type) params.set('redemption_type', filters.redemption_type);
  if (filters.max_points_cost !== undefined)
    params.set('max_points_cost', String(filters.max_points_cost));
  const qs = params.toString();
  return apiFetch<CatalogueResponse>(`/catalogue${qs ? `?${qs}` : ''}`);
}

export async function redeemItem(itemId: string): Promise<RedeemResponse> {
  return apiFetch<RedeemResponse>('/catalogue/redeem', {
    method: 'POST',
    body: JSON.stringify({ itemId, idempotencyKey: crypto.randomUUID() }),
  });
}

export async function getMyRedemptions(): Promise<{ redemptions: Redemption[] }> {
  return apiFetch<{ redemptions: Redemption[] }>('/catalogue/my-redemptions');
}

export const EARN_RULES: EarnRule[] = [
  { trigger: 'Sign up', points: '1,000 pts', notes: 'Welcome bonus, one-time' },
  {
    trigger: 'RedRoomPleasures purchase',
    points: '1 pt / $1 CAD',
    notes: 'Shipping & handling excluded',
  },
  { trigger: 'Admin promotion', points: 'Variable', notes: 'Merchant admin awards' },
  {
    trigger: 'Creator gift',
    points: 'Token value',
    notes: 'Platform keeps 25% commission',
  },
];
