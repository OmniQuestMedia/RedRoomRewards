/**
 * RedemptionService Unit Tests — Screen 06
 *
 * Canon Amendment 2026-08 + checkout wiring:
 *   - per-Standing-tier redemption band (floor + cap) in the points domain,
 *     valuation-converted from the merchandise cents (1000 pts = $1 default);
 *   - server-side Standing-tier derivation from lifetime points;
 *   - escrow settle / void lifecycle.
 */

import { LedgerService } from '../ledger/ledger.service';
import { TierEngineService } from '../services/tier-engine.service';
import {
  RedemptionService,
  CreateRedemptionRequest,
  GetEligibleRequest,
  TierCapExceededError,
  TierMinNotMetError,
  InsufficientBalanceError,
  NoRedemptionError,
  RedemptionStateError,
} from './redemption.service';
import { WalletModel } from '../db/models/wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { TierCapConfigModel } from '../db/models/tier-cap-config.model';
import { ValuationConfigModel } from '../db/models/valuation-config.model';
import { RedRoomTier } from '../interfaces/redroom-rewards';

jest.mock('../db/models/wallet.model');
jest.mock('../db/models/escrow-item.model');
jest.mock('../db/models/tier-cap-config.model');
jest.mock('../db/models/valuation-config.model');
jest.mock('../ledger/ledger.service');

// cpp default 0.1 (1000 pts = $1) ⇒ pointsBase = cents * 10.
const makeBand = (floorPct: number, capPct: number) => ({
  redemption_floor_pct: floorPct,
  redemption_cap_pct: capPct,
});

const mockBand = (band: ReturnType<typeof makeBand> | null) => {
  (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(band) }),
  });
};

// No active ValuationConfig ⇒ default 0.1 ¢/pt.
const mockValuationDefault = () => {
  (ValuationConfigModel.findOne as jest.Mock).mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  });
};

const makeWallet = (available: number, escrow = 0, version = 1) => ({
  userId: 'user-1',
  availableBalance: available,
  escrowBalance: escrow,
  version,
});

const makeRequest = (
  overrides: Partial<CreateRedemptionRequest> = {},
): CreateRedemptionRequest => ({
  userId: 'user-1',
  merchantId: 'redroompleasures',
  tenantId: 'tenant-1',
  orderId: 'order-1',
  eligibleMerchandiseValue: 1000, // cents ⇒ pointsBase 10000
  redemptionAmount: 1000, // points (in OBSESSION band 500..3500)
  idempotencyKey: 'idem-1',
  requestId: 'req-1',
  tierName: RedRoomTier.OBSESSION,
  ...overrides,
});

describe('RedemptionService', () => {
  let service: RedemptionService;
  let mockLedger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLedger = new LedgerService() as jest.Mocked<LedgerService>;
    mockLedger.claimIdempotency = jest.fn().mockResolvedValue(true);
    mockLedger.createEntry = jest.fn().mockResolvedValue({});
    mockLedger.getLifetimeEarnedPoints = jest.fn().mockResolvedValue(0);
    service = new RedemptionService(mockLedger, new TierEngineService());
    mockValuationDefault();
  });

  describe('createRedemption', () => {
    it('creates a redemption, holds escrow, and returns cash value + tier', async () => {
      mockBand(makeBand(5, 35)); // band 500..3500 on pointsBase 10000
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        ...makeWallet(5000),
        save: jest.fn(),
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        availableBalance: 4000,
        escrowBalance: 1000,
      });
      (EscrowItemModel.create as jest.Mock).mockResolvedValue({});

      const result = await service.createRedemption(makeRequest({ redemptionAmount: 1000 }));

      expect(result.redemptionAmount).toBe(1000);
      expect(result.cashValueCents).toBe(100); // 1000 pts * 0.1
      expect(result.tierName).toBe(RedRoomTier.OBSESSION);
      expect(result.newAvailableBalance).toBe(4000);
      expect(result.status).toBe('pending');
    });

    it('throws TierCapExceededError above the tier cap', async () => {
      mockBand(makeBand(5, 10)); // cap 10% of 10000 = 1000
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(100000));
      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 2000 })),
      ).rejects.toThrow(TierCapExceededError);
    });

    it('throws TierMinNotMetError below the 5% floor', async () => {
      mockBand(makeBand(5, 35)); // floor 5% of 10000 = 500
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(100000));
      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 100 })),
      ).rejects.toThrow(TierMinNotMetError);
    });

    it('throws InsufficientBalanceError when balance is too low', async () => {
      mockBand(makeBand(5, 50));
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(500)); // < 1000
      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 1000 })),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('derives the Standing tier from lifetime points when tierName is omitted', async () => {
      mockBand(makeBand(5, 45)); // REIGN band
      mockLedger.getLifetimeEarnedPoints = jest.fn().mockResolvedValue(120_000); // ≥100k ⇒ REIGN
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        ...makeWallet(5000),
        save: jest.fn(),
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        availableBalance: 4000,
        escrowBalance: 1000,
      });
      (EscrowItemModel.create as jest.Mock).mockResolvedValue({});

      const result = await service.createRedemption(
        makeRequest({ tierName: undefined, redemptionAmount: 1000 }),
      );

      expect(mockLedger.getLifetimeEarnedPoints).toHaveBeenCalledWith('user-1');
      expect(result.tierName).toBe(RedRoomTier.REIGN);
    });
  });

  describe('getEligible', () => {
    const eligibleRequest: GetEligibleRequest = {
      userId: 'user-1',
      merchantId: 'redroompleasures',
      tenantId: 'tenant-1',
      eligibleMerchandiseValue: 1000, // pointsBase 10000
      tierName: RedRoomTier.OBSESSION,
    };

    it('returns the band + cash value when balance allows', async () => {
      mockBand(makeBand(5, 35));
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(20000)),
      });

      const result = await service.getEligible(eligibleRequest);

      expect(result.eligible).toBe(true);
      expect(result.tierFloorPct).toBe(5);
      expect(result.tierCapPct).toBe(35);
      expect(result.minRedeemableAmount).toBe(500); // ceil(5% of 10000)
      expect(result.maxRedeemableAmount).toBe(3500); // min(35% of 10000, 20000)
      expect(result.maxRedeemableCashValueCents).toBe(350); // 3500 * 0.1
      expect(result.tierBandLabel).toBe('5%–35% of merchandise');
    });

    it('is ineligible when the balance cannot reach the floor', async () => {
      mockBand(makeBand(5, 35));
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(200)), // < floor 500
      });
      const result = await service.getEligible(eligibleRequest);
      expect(result.eligible).toBe(false);
      expect(result.minRedeemableAmount).toBe(500);
    });

    it('throws when no tier cap config', async () => {
      mockBand(null);
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(5000)),
      });
      await expect(service.getEligible(eligibleRequest)).rejects.toThrow(
        /No active tier cap config/,
      );
    });
  });

  describe('settleRedemption / voidRedemption', () => {
    const escrowId = 'esc-1';
    const held = {
      escrowId,
      userId: 'user-1',
      amount: 1000,
      status: 'held',
      queueItemId: 'order-1',
    };

    const mockEscrowCurrent = (doc: Record<string, unknown> | null) => {
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(doc),
      });
    };
    const mockEscrowClaim = (claimed: Record<string, unknown> | null) => {
      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(claimed),
      });
    };

    it('settle burns the escrow (escrowBalance down, available unchanged)', async () => {
      mockEscrowCurrent({ ...held });
      mockEscrowClaim({ ...held });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(4000, 1000));
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        availableBalance: 4000,
        escrowBalance: 0,
      });

      const result = await service.settleRedemption({ tenantId: 'tenant-1', escrowId });

      expect(result.status).toBe('settled');
      expect(result.escrowBalance).toBe(0);
      expect(result.newAvailableBalance).toBe(4000);
      expect(mockLedger.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'merchant_order_redemption_settle',
          stateTransition: 'escrow→settled',
          idempotencyKey: `settle-${escrowId}`,
        }),
      );
    });

    it('void releases the escrow back to available (in full, no fee)', async () => {
      mockEscrowCurrent({ ...held });
      mockEscrowClaim({ ...held });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(4000, 1000));
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        availableBalance: 5000,
        escrowBalance: 0,
      });

      const result = await service.voidRedemption({ tenantId: 'tenant-1', escrowId });

      expect(result.status).toBe('refunded');
      expect(result.newAvailableBalance).toBe(5000); // 4000 + 1000 released
      expect(result.escrowBalance).toBe(0);
      expect(mockLedger.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'merchant_order_redemption_void',
          stateTransition: 'escrow→available',
          amount: 1000,
        }),
      );
    });

    it('is idempotent — settle on an already-settled escrow is a no-op success', async () => {
      mockEscrowCurrent({ ...held, status: 'settled' });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(4000, 0)),
      });

      const result = await service.settleRedemption({ tenantId: 'tenant-1', escrowId });

      expect(result.status).toBe('settled');
      expect(EscrowItemModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockLedger.createEntry).not.toHaveBeenCalled();
    });

    it('throws NoRedemptionError when the escrow does not exist', async () => {
      mockEscrowCurrent(null);
      await expect(
        service.settleRedemption({ tenantId: 'tenant-1', escrowId: 'nope' }),
      ).rejects.toBeInstanceOf(NoRedemptionError);
    });

    it('throws RedemptionStateError on an illegal transition (void an already-settled escrow)', async () => {
      mockEscrowCurrent({ ...held, status: 'settled' });
      mockEscrowClaim(null); // not 'held' ⇒ claim fails
      await expect(
        service.voidRedemption({ tenantId: 'tenant-1', escrowId }),
      ).rejects.toBeInstanceOf(RedemptionStateError);
    });
  });
});
