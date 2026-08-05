/**
 * RedemptionService Unit Tests — Screen 06
 *
 * Canon Amendment 2026-08: per-Standing-tier redemption band (floor + cap)
 * applied to the merchandise-eligible value.
 */

import { LedgerService } from '../ledger/ledger.service';
import {
  RedemptionService,
  CreateRedemptionRequest,
  GetEligibleRequest,
  TierCapExceededError,
  TierMinNotMetError,
  InsufficientBalanceError,
} from './redemption.service';
import { WalletModel } from '../db/models/wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { TierCapConfigModel } from '../db/models/tier-cap-config.model';
import { RedRoomTier } from '../interfaces/redroom-rewards';

jest.mock('../db/models/wallet.model');
jest.mock('../db/models/escrow-item.model');
jest.mock('../db/models/tier-cap-config.model');
jest.mock('../ledger/ledger.service');

const makeBand = (floorPct: number, capPct: number) => ({
  redemption_floor_pct: floorPct,
  redemption_cap_pct: capPct,
});

const mockBand = (band: ReturnType<typeof makeBand> | null) => {
  (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(band),
    }),
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
  merchantId: 'merchant-1',
  tenantId: 'tenant-1',
  orderId: 'order-1',
  eligibleMerchandiseValue: 1000,
  redemptionAmount: 100,
  idempotencyKey: 'idem-key-1',
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
    service = new RedemptionService(mockLedger);
  });

  describe('createRedemption', () => {
    it('should create a redemption and hold points in escrow', async () => {
      mockBand(makeBand(5, 35)); // band 50..350 on 1000
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue({ ...wallet, save: jest.fn() });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        availableBalance: 400,
        escrowBalance: 100,
      });
      (EscrowItemModel.create as jest.Mock).mockResolvedValue({});

      const result = await service.createRedemption(makeRequest({ redemptionAmount: 100 }));

      expect(result.redemptionAmount).toBe(100);
      expect(result.newAvailableBalance).toBe(400); // 500 - 100
      expect(result.status).toBe('pending');
      expect(result.escrowId).toBeDefined();
      expect(mockLedger.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          stateTransition: 'available→escrow',
          reason: 'merchant_order_redemption',
        }),
      );
    });

    it('should throw TierCapExceededError when amount exceeds the tier cap', async () => {
      mockBand(makeBand(5, 10)); // cap 10% of 1000 = 100
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(1000));

      await expect(
        service.createRedemption(
          makeRequest({ redemptionAmount: 500, eligibleMerchandiseValue: 1000 }),
        ),
      ).rejects.toThrow(TierCapExceededError);
    });

    it('should throw TierMinNotMetError when amount is below the 5% floor', async () => {
      mockBand(makeBand(5, 35)); // floor 5% of 1000 = 50
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(1000));

      // Requesting 10 < floor(50)
      await expect(
        service.createRedemption(
          makeRequest({ redemptionAmount: 10, eligibleMerchandiseValue: 1000 }),
        ),
      ).rejects.toThrow(TierMinNotMetError);
    });

    it('should throw InsufficientBalanceError when balance is too low', async () => {
      mockBand(makeBand(5, 50)); // band 50..500 on 1000; 100 is in-band
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(50)); // only 50 available

      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 100 })),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('should replay idempotent request without creating a duplicate entry', async () => {
      mockLedger.claimIdempotency = jest.fn().mockResolvedValue(false); // already processed
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ escrowId: 'esc-existing', amount: 100 }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(400, 100)),
      });

      const result = await service.createRedemption(makeRequest());

      expect(result.escrowId).toBe('esc-existing');
      expect(mockLedger.createEntry).not.toHaveBeenCalled();
    });

    it('should throw when no tier cap config exists', async () => {
      mockBand(null);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(500));

      await expect(service.createRedemption(makeRequest())).rejects.toThrow(
        /No active tier cap config/,
      );
    });

    it('should throw when wallet not found', async () => {
      mockBand(makeBand(5, 35));
      (WalletModel.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.createRedemption(makeRequest())).rejects.toThrow(/Wallet not found/);
    });
  });

  describe('getEligible', () => {
    const eligibleRequest: GetEligibleRequest = {
      userId: 'user-1',
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
      eligibleMerchandiseValue: 1000,
      tierName: RedRoomTier.OBSESSION,
    };

    it('should return eligible=true with band metadata when balance allows', async () => {
      mockBand(makeBand(5, 35));
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(2000)),
      });

      const result = await service.getEligible(eligibleRequest);

      expect(result.eligible).toBe(true);
      expect(result.availableBalance).toBe(2000);
      expect(result.tierFloorPct).toBe(5);
      expect(result.tierCapPct).toBe(35);
      expect(result.minRedeemableAmount).toBe(50); // ceil(5% of 1000)
      expect(result.maxRedeemableAmount).toBe(350); // min(35% of 1000, 2000)
      expect(result.tierBandLabel).toBe('5%–35% of merchandise');
    });

    it('should return eligible=false when balance is below the floor', async () => {
      mockBand(makeBand(5, 35));
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(30)), // below floor of 50
      });

      const result = await service.getEligible(eligibleRequest);

      expect(result.eligible).toBe(false);
      expect(result.minRedeemableAmount).toBe(50);
    });

    it('should cap maxRedeemableAmount at available balance', async () => {
      mockBand(makeBand(5, 50));
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(100)), // only 100 available
      });

      const result = await service.getEligible({
        ...eligibleRequest,
        eligibleMerchandiseValue: 2000, // 50% of 2000 = 1000, floor 5% = 100
      });

      expect(result.maxRedeemableAmount).toBe(100); // limited by balance
      expect(result.eligible).toBe(true); // balance 100 >= floor 100
    });

    it('should throw when no tier cap config', async () => {
      mockBand(null);
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(500)),
      });

      await expect(service.getEligible(eligibleRequest)).rejects.toThrow(
        /No active tier cap config/,
      );
    });
  });
});
