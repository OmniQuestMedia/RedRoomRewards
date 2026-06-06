'use client';

import { useEffect, useState } from 'react';
import { getMyRedemptions, type Redemption } from '../../../lib/rrr-client';
import { requireAuth } from '../../../lib/auth';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-900 text-yellow-300',
  FULFILLED: 'bg-green-900 text-green-300',
  EXPIRED: 'bg-gray-800 text-gray-400',
  REVERSED: 'bg-red-900 text-red-300',
};

export default function RedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = requireAuth();
    if (!auth) return;

    getMyRedemptions()
      .then((r) => setRedemptions(r.redemptions))
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-400">My Redemption Codes</h1>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-4 text-red-300">{error}</div>
      )}

      {redemptions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-3">🎟️</div>
          <p>No redemptions yet.</p>
          <a href="/burn" className="mt-2 inline-block text-red-400 hover:underline">
            Browse the catalogue →
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {redemptions.map((r) => (
            <div
              key={r.redemption_id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-lg tracking-widest text-white break-all">
                    {r.redemption_code}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Redeemed: {new Date(r.createdAt).toLocaleDateString('en-CA')} ·{' '}
                    {r.points_spent.toLocaleString()} pts
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[r.status]}`}
                >
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
