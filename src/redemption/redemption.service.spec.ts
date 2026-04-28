/**
 * RedemptionService Unit Tests — Screen 06
 */

import { LedgerService } from '../ledger/ledger.service';
import {
  RedemptionService,
  CreateRedemptionRequest,
  GetEligibleRequest,
  TierCapExceededError,
  InsufficientBalanceError,
} from './redemption.service';
import { WalletModel } from '../db/models/wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { TierCapConfigModel } from '../db/models/tier-cap-config.model';

jest.mock('../db/models/wallet.model');
jest.mock('../db/models/escrow-item.model');
jest.mock('../db/models/tier-cap-config.model');
jest.mock('../ledger/ledger.service');

const makeTierCapConfig = (pct: number) => ({
  redemption_cap_pct: pct,
});

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
  transactionValue: 1000,
  redemptionAmount: 100,
  idempotencyKey: 'idem-key-1',
  requestId: 'req-1',
  tierName: 'GOLD',
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
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(35)),
        }),
      });
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        ...wallet,
        save: jest.fn(),
      });
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

    it('should throw TierCapExceededError when amount exceeds cap', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(10)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(1000));

      // Cap is 10% of 1000 = 100; requesting 500
      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 500, transactionValue: 1000 })),
      ).rejects.toThrow(TierCapExceededError);
    });

    it('should throw InsufficientBalanceError when balance is too low', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(50)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(50)); // only 50 available

      await expect(
        service.createRedemption(makeRequest({ redemptionAmount: 100 })),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('should replay idempotent request without creating a duplicate entry', async () => {
      mockLedger.claimIdempotency = jest.fn().mockResolvedValue(false); // already processed
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          escrowId: 'esc-existing',
          amount: 100,
        }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(400, 100)),
      });

      const result = await service.createRedemption(makeRequest());

      expect(result.escrowId).toBe('esc-existing');
      expect(mockLedger.createEntry).not.toHaveBeenCalled();
    });

    it('should throw when no tier cap config exists', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(makeWallet(500));

      await expect(service.createRedemption(makeRequest())).rejects.toThrow(
        /No active tier cap config/,
      );
    });

    it('should throw when wallet not found', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(35)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.createRedemption(makeRequest())).rejects.toThrow(/Wallet not found/);
    });
  });

  describe('getEligible', () => {
    const eligibleRequest: GetEligibleRequest = {
      userId: 'user-1',
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
      transactionValue: 1000,
      tierName: 'GOLD',
    };

    it('should return eligible=true when balance and cap allow redemption', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(35)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(2000)),
      });

      const result = await service.getEligible(eligibleRequest);

      expect(result.eligible).toBe(true);
      expect(result.availableBalance).toBe(2000);
      expect(result.tierCapPct).toBe(35);
      expect(result.maxRedeemableAmount).toBe(350); // min(35% of 1000, 2000)
      expect(result.tierCapLabel).toBe('35% max redemption');
    });

    it('should return eligible=false when balance is zero', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(35)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(0)),
      });

      const result = await service.getEligible(eligibleRequest);

      expect(result.eligible).toBe(false);
      expect(result.maxRedeemableAmount).toBe(0);
    });

    it('should cap maxRedeemableAmount at available balance', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeTierCapConfig(50)),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(100)), // only 100 available
      });

      const result = await service.getEligible({
        ...eligibleRequest,
        transactionValue: 2000, // 50% of 2000 = 1000, but only 100 available
      });

      expect(result.maxRedeemableAmount).toBe(100); // limited by balance
    });

    it('should throw when no tier cap config', async () => {
      (TierCapConfigModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeWallet(500)),
      });

      await expect(service.getEligible(eligibleRequest)).rejects.toThrow(
        /No active tier cap config/,
      );
    });
  });
});
