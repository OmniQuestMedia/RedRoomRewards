/**
 * AdminEarnService Unit Tests — Screen 07
 */

import { LedgerService } from '../ledger/ledger.service';
import {
  AdminEarnService,
  AdminEarnRequest,
  StepUpRequiredError,
  InvalidReasonCodeError,
} from './admin-earn.service';
import * as jwt from 'jsonwebtoken';

jest.mock('../ledger/ledger.service');
jest.mock('jsonwebtoken');

const makeStepUpToken = () => 'Bearer valid.jwt.token';

const makeRequest = (overrides: Partial<AdminEarnRequest> = {}): AdminEarnRequest => ({
  recipientId: 'user-456',
  recipientType: 'member',
  amount: 1000,
  reasonCode: 'PROMO_BONUS',
  walletBucket: 'promotional_bonus',
  merchantId: 'merchant-1',
  tenantId: 'tenant-1',
  idempotencyKey: 'idem-earn-1',
  requestId: 'req-1',
  authorizationHeader: makeStepUpToken(),
  adminId: 'admin-1',
  ...overrides,
});

describe('AdminEarnService', () => {
  let service: AdminEarnService;
  let mockLedger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLedger = new LedgerService() as jest.Mocked<LedgerService>;
    mockLedger.claimIdempotency = jest.fn().mockResolvedValue(true);
    mockLedger.createEntry = jest.fn().mockResolvedValue({});
    mockLedger.creditPoints = jest.fn().mockResolvedValue(true);
    service = new AdminEarnService(mockLedger);

    // Default step-up claim valid
    (jwt.decode as jest.Mock).mockReturnValue({ step_up: true, sub: 'admin-1' });
  });

  describe('awardPoints', () => {
    it('should award PROMO_BONUS points to a member', async () => {
      const result = await service.awardPoints(makeRequest());

      expect(result.recipientId).toBe('user-456');
      expect(result.recipientType).toBe('member');
      expect(result.amount).toBe(1000);
      expect(result.reasonCode).toBe('PROMO_BONUS');
      expect(result.walletBucket).toBe('promotional_bonus');
      expect(result.transactionId).toBeDefined();
      expect(result.auditId).toBeDefined();
      expect(mockLedger.creditPoints).toHaveBeenCalled();
    });

    it('should award MODEL_GIFT points to a model via createEntry', async () => {
      const result = await service.awardPoints(
        makeRequest({ recipientType: 'model', reasonCode: 'MODEL_GIFT' }),
      );

      expect(result.recipientType).toBe('model');
      expect(result.reasonCode).toBe('MODEL_GIFT');
      expect(mockLedger.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountType: 'model',
          balanceState: 'earned',
          reason: 'model_gift',
        }),
      );
    });

    it('should throw StepUpRequiredError when step_up claim is missing', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ sub: 'admin-1' }); // no step_up

      await expect(service.awardPoints(makeRequest())).rejects.toThrow(StepUpRequiredError);
    });

    it('should throw StepUpRequiredError when step_up is false', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ step_up: false, sub: 'admin-1' });

      await expect(service.awardPoints(makeRequest())).rejects.toThrow(StepUpRequiredError);
    });

    it('should throw StepUpRequiredError when Authorization header is missing', async () => {
      await expect(service.awardPoints(makeRequest({ authorizationHeader: '' }))).rejects.toThrow(
        StepUpRequiredError,
      );
    });

    it('should throw StepUpRequiredError when token is not Bearer format', async () => {
      await expect(
        service.awardPoints(makeRequest({ authorizationHeader: 'Basic abc123' })),
      ).rejects.toThrow(StepUpRequiredError);
    });

    it('should throw InvalidReasonCodeError for unknown reason code', async () => {
      await expect(
        service.awardPoints(makeRequest({ reasonCode: 'UNKNOWN_CODE' as 'PROMO_BONUS' })),
      ).rejects.toThrow(InvalidReasonCodeError);
    });

    it('should throw on non-positive amount', async () => {
      await expect(service.awardPoints(makeRequest({ amount: 0 }))).rejects.toThrow(
        /amount must be a positive integer/,
      );
    });

    it('should return cached response on idempotency replay', async () => {
      mockLedger.claimIdempotency = jest.fn().mockResolvedValue(false); // already processed

      const result = await service.awardPoints(makeRequest());

      expect(result.recipientId).toBe('user-456');
      expect(mockLedger.creditPoints).not.toHaveBeenCalled();
      expect(mockLedger.createEntry).not.toHaveBeenCalled();
    });
  });
});
