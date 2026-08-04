import { Test, TestingModule } from '@nestjs/testing';
import { MemberService } from './member.service';
import { GateGuardAVService } from './gateguard-av.service';
import { RedRoomLedgerService } from './redroom-ledger.service';
import { TierEngineService } from './tier-engine.service';
import { RedRoomTier } from '../interfaces/redroom-rewards';

describe('MemberService', () => {
  let service: MemberService;
  let avService: jest.Mocked<GateGuardAVService>;
  let ledgerService: jest.Mocked<RedRoomLedgerService>;
  let tierService: jest.Mocked<TierEngineService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberService,
        {
          provide: GateGuardAVService,
          useValue: {
            verifyAccount: jest.fn().mockResolvedValue({
              verified: true,
              verifiedAt: new Date('2026-01-01T00:00:00Z'),
              method: 'GATEGUARD',
              confidenceScore: 98,
            }),
          },
        },
        {
          provide: RedRoomLedgerService,
          useValue: {
            awardPointsWithCompliance: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: TierEngineService,
          useValue: {
            calculateTier: jest.fn().mockReturnValue({
              currentTier: RedRoomTier.DESIRE,
              pointsToNextTier: 4000,
              vibeDescription: 'Heartbeat — alive in the program',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MemberService>(MemberService);
    avService = module.get(GateGuardAVService);
    ledgerService = module.get(RedRoomLedgerService);
    tierService = module.get(TierEngineService);
  });

  it('enforces mandatory 18+ AV on signup and awards the welcome bonus', async () => {
    const profile = await service.signup({ email: 'guest@example.com' });

    expect(avService.verifyAccount).toHaveBeenCalledWith('guest@example.com', undefined);
    expect(ledgerService.awardPointsWithCompliance).toHaveBeenCalledWith(
      expect.stringMatching(/^rr-[0-9a-f-]{36}$/),
      1000,
      'WELCOME_BONUS',
    );
    expect(tierService.calculateTier).toHaveBeenCalledWith(1000);
    expect(profile.tier).toBe(RedRoomTier.DESIRE);
    expect(profile.totalPoints).toBe(1000);
    expect(profile.promotionalBalance).toBe(1000);
    expect(profile.verifiedAt).toBeInstanceOf(Date);
  });

  it('blocks account creation when GateGuard AV fails', async () => {
    avService.verifyAccount.mockResolvedValueOnce({
      verified: false,
      verifiedAt: new Date(),
      method: 'GATEGUARD',
      confidenceScore: 0,
    });

    await expect(service.signup({ email: 'blocked@example.com' })).rejects.toThrow(
      '18+ verification required - account creation blocked',
    );
    expect(ledgerService.awardPointsWithCompliance).not.toHaveBeenCalled();
  });

  it('rejects signup with invalid email', async () => {
    await expect(service.signup({ email: 'not-an-email' })).rejects.toThrow(
      'Valid email is required',
    );
    expect(avService.verifyAccount).not.toHaveBeenCalled();
  });

  it('rejects signup with empty email', async () => {
    await expect(service.signup({ email: '' })).rejects.toThrow('Valid email is required');
  });

  it('rejects malformed email with @@ prefix', async () => {
    await expect(service.signup({ email: '@@domain.com' })).rejects.toThrow(
      'Valid email is required',
    );
    expect(avService.verifyAccount).not.toHaveBeenCalled();
  });
});
