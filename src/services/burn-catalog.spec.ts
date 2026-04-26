import { Test } from '@nestjs/testing';
import { BurnCatalogService } from './burn-catalog.service';
import { RedRoomLedgerService } from './redroom-ledger.service';

describe('BurnCatalogService', () => {
  let service: BurnCatalogService;
  let ledgerService: { awardPointsWithCompliance: jest.Mock };

  beforeEach(async () => {
    ledgerService = { awardPointsWithCompliance: jest.fn().mockResolvedValue(true) };
    const module = await Test.createTestingModule({
      providers: [
        BurnCatalogService,
        {
          provide: RedRoomLedgerService,
          useValue: ledgerService,
        },
      ],
    }).compile();
    service = module.get(BurnCatalogService);
  });

  it('exists', () => {
    expect(service).toBeDefined();
  });

  it('redeemPoints should delegate to ledger with negative points', async () => {
    const result = await service.redeemPoints({
      memberId: 'member-1',
      pointsSpent: 500,
      itemId: 'item-42',
      reason: 'PROMO',
    });
    expect(result).toBe(true);
    expect(ledgerService.awardPointsWithCompliance).toHaveBeenCalledWith(
      'member-1',
      -500,
      'BURN_item-42_PROMO',
    );
  });

  it('rejects redemption with zero pointsSpent', async () => {
    await expect(
      service.redeemPoints({ memberId: 'm', pointsSpent: 0, itemId: 'i', reason: 'R' }),
    ).rejects.toThrow('pointsSpent must be a positive integer');
    expect(ledgerService.awardPointsWithCompliance).not.toHaveBeenCalled();
  });

  it('rejects redemption with negative pointsSpent', async () => {
    await expect(
      service.redeemPoints({ memberId: 'm', pointsSpent: -100, itemId: 'i', reason: 'R' }),
    ).rejects.toThrow('pointsSpent must be a positive integer');
  });

  it('rejects redemption with fractional pointsSpent', async () => {
    await expect(
      service.redeemPoints({ memberId: 'm', pointsSpent: 1.5, itemId: 'i', reason: 'R' }),
    ).rejects.toThrow('pointsSpent must be a positive integer');
  });

  it('rejects redemption with missing memberId', async () => {
    await expect(
      service.redeemPoints({ memberId: '', pointsSpent: 100, itemId: 'i', reason: 'R' }),
    ).rejects.toThrow('memberId is required');
  });

  it('rejects redemption with missing itemId', async () => {
    await expect(
      service.redeemPoints({ memberId: 'm', pointsSpent: 100, itemId: '', reason: 'R' }),
    ).rejects.toThrow('itemId is required');
  });

  it('redeemGift adds 25% platform commission and burns total via ledger', async () => {
    const result = await service.redeemGift({
      giftId: 'rose-200',
      tokenValue: 200,
      memberId: 'member-7',
      anonymous: false,
    });
    expect(result).toBe(true);
    expect(ledgerService.awardPointsWithCompliance).toHaveBeenCalledWith(
      'member-7',
      -250,
      'GIFT_rose-200',
    );
  });

  it('redeemGift tags reason with _ANON when anonymous is true', async () => {
    await service.redeemGift({
      giftId: 'champagne-1000',
      tokenValue: 1000,
      memberId: 'member-9',
      anonymous: true,
    });
    expect(ledgerService.awardPointsWithCompliance).toHaveBeenCalledWith(
      'member-9',
      -1250,
      'GIFT_champagne-1000_ANON',
    );
  });
});
