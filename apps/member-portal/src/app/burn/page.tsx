'use client';

import { useEffect, useState } from 'react';
import { getCatalogue, redeemItem, type CatalogueItem } from '../../../lib/rrr-client';
import { requireAuth } from '../../../lib/auth';

const TYPE_LABELS: Record<string, string> = {
  DISCOUNT_CODE: '🏷️ Discount Code',
  FREE_PRODUCT: '🎁 Free Product',
  EXCLUSIVE_ACCESS: '🔐 Exclusive Access',
};

export default function BurnPage() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; title: string } | null>(null);

  useEffect(() => {
    const auth = requireAuth();
    if (!auth) return;

    getCatalogue()
      .then((r) => setItems(r.items))
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleRedeem(itemId: string, title: string) {
    setRedeeming(itemId);
    setSuccess(null);
    try {
      const result = await redeemItem(itemId);
      setSuccess({ code: result.redemptionCode, title });
    } catch (err) {
      setError(String(err));
    } finally {
      setRedeeming(null);
    }
  }

  if (loading) return <div className="py-20 text-center text-gray-400">Loading catalogue…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-400">Rewards Catalogue</h1>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-4 text-red-300">{error}</div>
      )}

      {success && (
        <div className="rounded-xl border border-green-700 bg-green-950 p-5">
          <div className="font-semibold text-green-300">Redeemed: {success.title}</div>
          <div className="mt-2 font-mono text-2xl tracking-widest text-white">{success.code}</div>
          <div className="mt-1 text-xs text-gray-400">
            Save this code — it will also appear in{' '}
            <a href="/redemptions" className="underline">
              My Codes
            </a>
            .
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-gray-500">No rewards available right now. Check back soon!</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.item_id}
              className="flex flex-col rounded-xl border border-gray-800 bg-gray-900 p-5"
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="mb-3 h-32 w-full rounded object-cover"
                />
              )}
              <div className="mb-1 text-xs text-gray-500">{TYPE_LABELS[item.redemption_type]}</div>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p className="mt-1 flex-1 text-sm text-gray-400">{item.description}</p>
              {item.inventory_count !== null && (
                <div className="mt-2 text-xs text-yellow-500">{item.inventory_count} remaining</div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="font-black text-red-400 text-xl">
                  {item.points_cost.toLocaleString()} pts
                </span>
                <button
                  onClick={() => handleRedeem(item.item_id, item.title)}
                  disabled={redeeming === item.item_id}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {redeeming === item.item_id ? 'Redeeming…' : 'Redeem'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
