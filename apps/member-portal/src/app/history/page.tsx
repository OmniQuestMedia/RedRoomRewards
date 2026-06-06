'use client';

import { useEffect, useState } from 'react';
import { getTransactionHistory, type Transaction } from '../../../lib/rrr-client';
import { requireAuth } from '../../../lib/auth';

export default function HistoryPage() {
  const [entries, setEntries] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = requireAuth();
    if (!auth) return;

    setLoading(true);
    getTransactionHistory(auth.memberId, page)
      .then((r) => {
        setEntries(r.entries);
        setTotal(r.total);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-400">Transaction History</h1>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-4 text-red-300">{error}</div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-400">Loading…</div>
      ) : entries.length === 0 ? (
        <p className="text-gray-500">No transactions yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((tx) => (
                <tr key={tx.entryId} className="border-t border-gray-800 bg-gray-950">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {new Date(tx.timestamp).toLocaleDateString('en-CA')}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{tx.reason}</td>
                  <td
                    className={`px-4 py-3 text-right font-bold ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {tx.type === 'credit' ? '+' : '-'}
                    {tx.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>{total} total transactions</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1 hover:bg-gray-800 disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="px-2">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < 20}
            className="rounded px-3 py-1 hover:bg-gray-800 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
