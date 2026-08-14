'use client';

import { useEffect, useState } from 'react';
import {
  getBalance,
  getTransactionHistory,
  type BalanceResponse,
  type Transaction,
} from '../../lib/rrr-client';
import { requireAuth } from '../../lib/auth';
import { resolveTier } from '../lib/design-tokens';
import { TierBadge } from '../components/ui/tier-badge';

export default function DashboardPage() {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = requireAuth();
    if (!auth) return;

    Promise.all([getBalance(auth.memberId), getTransactionHistory(auth.memberId, 1)])
      .then(([bal, history]) => {
        setBalance(bal);
        setRecent(history.entries.slice(0, 5));
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-gray-400">Loading…</div>;
  if (error)
    return <div className="rounded border border-red-800 bg-red-950 p-4 text-red-300">{error}</div>;

  const tier = resolveTier(balance?.tier);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-red-900 bg-gray-900 p-6">
        <h1 className="mb-2 text-2xl font-bold text-red-400">Welcome back</h1>
        <div className="flex items-end gap-4">
          <span className="text-6xl font-black text-white">
            {balance?.totalPoints.toLocaleString()}
          </span>
          <span className="mb-2 text-xl text-gray-400">points</span>
        </div>
        <div className="mt-3">
          <TierBadge tier={tier} />
        </div>
        <div className="mt-2 text-sm text-gray-500">
          Promotional balance: {balance?.promotionalBalance.toLocaleString()} pts
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Recent Activity</h2>
        {recent.length === 0 ? (
          <p className="text-gray-500">
            No activity yet. Start earning by shopping at RedRoomPleasures!
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((tx) => (
              <div
                key={tx.entryId}
                className={
                  'flex items-center justify-between rounded-lg ' +
                  'border border-gray-800 bg-gray-900 px-4 py-3'
                }
              >
                <div>
                  <div className="text-sm text-gray-200">{tx.reason}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(tx.timestamp).toLocaleDateString('en-CA')}
                  </div>
                </div>
                <span
                  className={`font-bold ${
                    tx.type === 'credit' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '-'}
                  {tx.amount.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        )}
        <a href="/history" className="mt-4 block text-sm text-red-400 hover:underline">
          View full history →
        </a>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <a
          href="/burn"
          className={
            'rounded-xl border border-red-800 bg-red-950 p-6 ' + 'text-center hover:border-red-600'
          }
        >
          <div className="text-3xl">🎁</div>
          <div className="mt-2 font-semibold text-red-300">Redeem Points</div>
          <div className="text-xs text-gray-500">Browse rewards catalogue</div>
        </a>
        <a
          href="/earn"
          className={
            'rounded-xl border border-gray-700 bg-gray-900 p-6 ' +
            'text-center hover:border-gray-500'
          }
        >
          <div className="text-3xl">⭐</div>
          <div className="mt-2 font-semibold text-gray-300">Earn More</div>
          <div className="text-xs text-gray-500">Ways to earn points</div>
        </a>
      </section>
    </div>
  );
}
