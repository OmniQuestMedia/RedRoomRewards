'use client';

/**
 * Promotions — progress bars and timed redemption offers.
 *
 * Deliberately calm: progress is shown as "how far you've come", offers are
 * listed with their real point price and no countdown timers, urgency copy, or
 * randomised reveals. An offer that has run out simply says so.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  claimPromotionOffer,
  getProgressBars,
  getPromotionOffers,
  type ProgressBar,
  type PromotionOffer,
} from '../../../lib/rrr-client';
import { requireAuth } from '../../../lib/auth';

const METRIC_LABELS: Record<string, string> = {
  SPEND_UNITS: 'spent',
  POINTS_EARNED: 'points earned',
  QUALIFYING_PURCHASES: 'purchases',
};

function formatEnds(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProgressBarCard({ bar }: { bar: ProgressBar }) {
  const pct = Math.round(bar.progressRatio * 100);
  const complete = bar.unitsRemaining === 0;
  const endsOn = formatEnds(bar.endsAt);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-100">{bar.campaignName}</h3>
          <p className="mt-1 text-sm text-gray-400">{bar.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-red-400">+{bar.bonusPoints.toLocaleString()}</div>
          <div className="text-xs text-gray-500">points</div>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-gray-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${bar.campaignName} progress`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>
            {bar.progressUnits.toLocaleString()} / {bar.threshold.toLocaleString()}{' '}
            {METRIC_LABELS[bar.metric] ?? bar.metric.toLowerCase()}
          </span>
          <span>{complete ? 'Bonus earned' : `${bar.unitsRemaining.toLocaleString()} to go`}</span>
        </div>
      </div>

      {(bar.completions > 0 || endsOn) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {bar.completions > 0 && (
            <span>
              Completed {bar.completions}× {bar.repeatable ? '· repeats' : ''}
            </span>
          )}
          {endsOn && <span>Runs until {endsOn}</span>}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  onClaim,
  claiming,
}: {
  offer: PromotionOffer;
  onClaim: (campaignId: string) => void;
  claiming: boolean;
}) {
  const soldOut = offer.remainingInventory === 0;
  const noClaimsLeft = offer.claimsRemainingForMember === 0;
  const disabled = soldOut || noClaimsLeft || claiming;
  const endsOn = formatEnds(offer.endsAt);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-100">{offer.name}</h3>
          <p className="mt-1 text-sm text-gray-400">{offer.description}</p>
          {endsOn && <p className="mt-2 text-xs text-gray-500">Available until {endsOn}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-red-400">{offer.pointsPrice.toLocaleString()}</div>
          <div className="text-xs text-gray-500">points</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-xs text-gray-500">
          {soldOut
            ? 'Fully claimed'
            : noClaimsLeft
              ? 'You have already claimed this'
              : `${offer.claimsRemainingForMember} claim${offer.claimsRemainingForMember === 1 ? '' : 's'} available to you`}
        </span>

        <button
          type="button"
          onClick={() => onClaim(offer.campaignId)}
          disabled={disabled}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
        >
          {claiming ? 'Redeeming…' : 'Redeem points'}
        </button>
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  const [bars, setBars] = useState<ProgressBar[]>([]);
  const [offers, setOffers] = useState<PromotionOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ name: string; code: string; points: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    const [barsResult, offersResult] = await Promise.all([getProgressBars(), getPromotionOffers()]);
    setBars(barsResult.bars);
    setOffers(offersResult.offers);
  }, []);

  useEffect(() => {
    const auth = requireAuth();
    if (!auth) return;

    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [load]);

  async function handleClaim(campaignId: string) {
    setClaimingId(campaignId);
    setError(null);
    try {
      const result = await claimPromotionOffer(campaignId);
      setClaimed({
        name: result.campaignName,
        code: result.claimCode,
        points: result.pointsBurned,
      });
      // Refetch so the member's remaining claims and inventory are truthful
      // rather than optimistically guessed on the client.
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimingId(null);
    }
  }

  if (loading) return <div className="py-20 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-red-400">Promotions</h1>
        <p className="mt-1 text-sm text-gray-400">
          Bonuses you build toward, and ways to put the points you already have to work.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-4 text-red-300">{error}</div>
      )}

      {claimed && (
        <div className="rounded-xl border border-green-800 bg-green-950 p-5">
          <p className="font-semibold text-green-300">{claimed.name} redeemed</p>
          <p className="mt-1 text-sm text-green-400">
            {claimed.points.toLocaleString()} points redeemed. Your code:
          </p>
          <code className="mt-2 inline-block rounded bg-black/40 px-3 py-1.5 font-mono text-sm text-green-200">
            {claimed.code}
          </code>
        </div>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Your progress</h2>
        {bars.length === 0 ? (
          <p className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-500">
            No progress bonuses running right now.
          </p>
        ) : (
          <div className="space-y-3">
            {bars.map((bar) => (
              <ProgressBarCard key={bar.campaignId} bar={bar} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Redeem your points</h2>
        {offers.length === 0 ? (
          <p className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-500">
            No redemption offers available right now.
          </p>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard
                key={offer.campaignId}
                offer={offer}
                onClaim={handleClaim}
                claiming={claimingId === offer.campaignId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
