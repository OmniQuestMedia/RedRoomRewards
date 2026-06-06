'use client';

import { EARN_RULES } from '../../../lib/rrr-client';

const TIER_TABLE = [
  {
    tier: 'Red Desire',
    threshold: '0 pts',
    multiplier: '1.0×',
    vibe: 'Heartbeat — alive in the program',
  },
  {
    tier: 'Red Passion',
    threshold: '5,000 pts',
    multiplier: 'Configured',
    vibe: 'Emotionally invested',
  },
  {
    tier: 'Red Obsession',
    threshold: '25,000 pts',
    multiplier: 'Configured',
    vibe: 'Deep craving, committed',
  },
  {
    tier: 'Red Reign',
    threshold: '100,000 pts',
    multiplier: 'Configured',
    vibe: 'All-in — the most devoted',
  },
];

export default function EarnPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-red-400">How to Earn Points</h1>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Earn Rules</h2>
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Trigger</th>
                <th className="px-4 py-3 text-left">Points</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {EARN_RULES.map((rule, i) => (
                <tr key={i} className="border-t border-gray-800 bg-gray-950">
                  <td className="px-4 py-3 font-medium text-white">{rule.trigger}</td>
                  <td className="px-4 py-3 font-bold text-red-400">{rule.points}</td>
                  <td className="px-4 py-3 text-gray-400">{rule.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Tier Thresholds</h2>
        <div className="space-y-3">
          {TIER_TABLE.map((t) => (
            <div
              key={t.tier}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <div>
                <div className="font-bold text-red-300">{t.tier}</div>
                <div className="text-xs text-gray-500">{t.vibe}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-white">{t.threshold}</div>
                <div className="text-xs text-gray-500">Multiplier: {t.multiplier}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-lg border border-yellow-900 bg-yellow-950 p-4 text-sm text-yellow-300">
        <strong>Note:</strong> Earn rules and multipliers may vary by tenant. Contact support for
        your specific program details.
      </div>
    </div>
  );
}
