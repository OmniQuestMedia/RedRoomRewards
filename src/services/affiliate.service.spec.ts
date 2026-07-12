import { AffiliateService } from './affiliate.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockSave = jest.fn();

jest.mock('../db/models/affiliate-link.model', () => ({
  AffiliateLinkModel: jest.fn().mockImplementation(() => ({
    bonus_points_pct: 0,
    save: mockSave,
  })),
}));

const { AffiliateLinkModel } = jest.requireMock('../db/models/affiliate-link.model') as {
  AffiliateLinkModel: jest.Mock & {
    findOne: (...args: unknown[]) => unknown;
    findOneAndUpdate: (...args: unknown[]) => unknown;
  };
};
AffiliateLinkModel.findOne = (...args: unknown[]) => mockFindOne(...args);
AffiliateLinkModel.findOneAndUpdate = (...args: unknown[]) => mockFindOneAndUpdate(...args);

describe('AffiliateService', () => {
  let service: AffiliateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AffiliateService();
  });

  describe('registerLink', () => {
    it('throws BadRequestException for non-integer bonus_points_pct', async () => {
      await expect(
        service.registerLink({
          tenant_id: 't-1',
          creator_id: 'c-1',
          platform: 'chatnow',
          external_creator_ref: 'creator-slug',
          bonus_points_pct: 1.5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for out-of-range bonus_points_pct (> 100)', async () => {
      await expect(
        service.registerLink({
          tenant_id: 't-1',
          creator_id: 'c-1',
          platform: 'synthimate',
          external_creator_ref: 'creator-slug',
          bonus_points_pct: 101,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative bonus_points_pct', async () => {
      await expect(
        service.registerLink({
          tenant_id: 't-1',
          creator_id: 'c-1',
          platform: 'synthimate',
          external_creator_ref: 'creator-slug',
          bonus_points_pct: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates record with default pct=0 when not provided', async () => {
      const saved = { affiliate_id: 'aff-1', bonus_points_pct: 0 };
      mockSave.mockResolvedValue(saved);

      const result = await service.registerLink({
        tenant_id: 't-1',
        creator_id: 'c-1',
        platform: 'redroompleasures',
        external_creator_ref: 'creator-ref',
      });

      expect(mockSave).toHaveBeenCalled();
      expect(result.bonus_points_pct).toBe(0);
    });

    it('creates record with valid bonus_points_pct', async () => {
      const saved = { affiliate_id: 'aff-2', bonus_points_pct: 10 };
      mockSave.mockResolvedValue(saved);

      const result = await service.registerLink({
        tenant_id: 't-1',
        creator_id: 'c-2',
        platform: 'chatnow',
        external_creator_ref: 'creator-slug',
        bonus_points_pct: 10,
      });

      expect(result.bonus_points_pct).toBe(10);
    });
  });

  describe('resolveBonus', () => {
    it('returns zero bonus when no active affiliate link found', async () => {
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      const result = await service.resolveBonus('t-1', 'c-1', 1000);

      expect(result.bonus_points).toBe(0);
      expect(result.total_points).toBe(1000);
      expect(result.affiliate_id).toBeNull();
    });

    it('calculates bonus correctly from active link', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ affiliate_id: 'aff-1', bonus_points_pct: 15 }),
      });

      const result = await service.resolveBonus('t-1', 'c-1', 1000);

      expect(result.base_points).toBe(1000);
      expect(result.bonus_points).toBe(150);
      expect(result.total_points).toBe(1150);
      expect(result.affiliate_id).toBe('aff-1');
    });

    it('floors fractional bonus points', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ affiliate_id: 'aff-2', bonus_points_pct: 10 }),
      });

      const result = await service.resolveBonus('t-1', 'c-1', 333);

      expect(result.bonus_points).toBe(33); // floor(333 * 10 / 100)
      expect(result.total_points).toBe(366);
    });
  });

  describe('deactivateLink', () => {
    it('throws NotFoundException when link not found', async () => {
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.deactivateLink('aff-missing', 't-1')).rejects.toThrow(NotFoundException);
    });

    it('deactivates link successfully', async () => {
      mockFindOneAndUpdate.mockReturnValue({
        exec: () => Promise.resolve({ affiliate_id: 'aff-1', is_active: false }),
      });

      await expect(service.deactivateLink('aff-1', 't-1')).resolves.toBeUndefined();
    });
  });

  describe('ensureLinkForCreator', () => {
    it('returns the existing link without creating a duplicate', async () => {
      const existing = { affiliate_id: 'aff-existing', is_active: true, bonus_points_pct: 0 };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(existing) });

      const result = await service.ensureLinkForCreator({
        tenant_id: 't-1',
        creator_id: 'acc-9',
        external_creator_ref: 'acc-9',
        platform: 'chatnow',
      });

      expect(result).toBe(existing);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('mints an ON link with bonus_points_pct=0 (non-financial) when none exists', async () => {
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });
      const saved = { affiliate_id: 'aff-new', is_active: true, bonus_points_pct: 0 };
      mockSave.mockResolvedValue(saved);

      const result = await service.ensureLinkForCreator({
        tenant_id: 't-1',
        creator_id: 'acc-9',
        external_creator_ref: 'acc-9',
        platform: 'synthimate',
      });

      expect(mockSave).toHaveBeenCalled();
      expect(result.bonus_points_pct).toBe(0);
    });
  });

  describe('getLinkForCreator', () => {
    it('returns the active link for the creator', async () => {
      const link = { affiliate_id: 'aff-1', is_active: true };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(link) });

      const result = await service.getLinkForCreator('t-1', 'acc-9');

      expect(result).toBe(link);
    });
  });
});
