export enum RedRoomTier {
  DESIRE = 'DESIRE',
  PASSION = 'PASSION',
  OBSESSION = 'OBSESSION',
  REIGN = 'REIGN',
}

export interface GateGuardAVResult {
  verified: boolean;
  verifiedAt: Date;
  method: 'YOTI' | 'DOCUMENT_LIVENESS' | 'GATEGUARD';
  confidenceScore: number;
}

export interface AwardingWalletUploadRow {
  creatorId: string;
  points: number;
  reason: string;
  expiryDays?: number;
}

export interface AwardingWalletUploadResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ row: number; error: string }>;
}

export interface CreatorGiftingPromotion {
  creatorId: string;
  title: string;
  pointsAwarded: number;
  condition: string; // e.g. "15-min private" or "Lovense 222 vibe"
  maxRecipients?: number;
  expiryDays?: number;
}

export interface TierProgress {
  currentTier: RedRoomTier;
  pointsToNextTier: number;
  vibeDescription: string;
}

export interface WgsScoreRequest {
  transactionId: string;
  guestId: string;
  amountCzt: number;
  context?: Record<string, unknown>;
}

export type WgsAction = 'PASS' | 'REVIEW' | 'SOFT_DECLINE' | 'HARD_DECLINE';
export type WgsWelfareTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface WgsScoreResponse {
  fraudRisk: number;
  welfareRisk: number;
  welfareTier: WgsWelfareTier;
  action: WgsAction;
}

export interface MemberSignupRequest {
  email: string;
  password?: string;
  billingAddress?: unknown;
}

export interface MemberProfile {
  memberId: string;
  tier: RedRoomTier;
  totalPoints: number;
  promotionalBalance: number;
  verifiedAt: Date;
}

export interface BurnRedemption {
  memberId: string;
  itemId: string; // RedRoomPleasures product ID
  pointsSpent: number;
  reason: string;
}

export interface LiabilityReport {
  totalPromotionalIssued: number;
  totalBurned: number;
  outstandingLiability: number;
  asOf: Date;
}

export interface WhiteLabelConfig {
  merchantId: string;
  brandName: string;
  logoUrl?: string;
  primaryColor: string;
  serviceBureauMode: boolean; // true = RRR hosts + answers support
}

export interface CreatorGiftingPanelState {
  promotionalBalance: number;
  recentPromotions: Array<{
    title: string;
    pointsAwarded: number;
    redeemedCount: number;
  }>;
}

export interface TierMultiplierConfig {
  tier: RedRoomTier;
  earningMultiplier: number; // e.g. 1.2 for RedPassion
  doublePointsDaysPerYear: number;
  birthdayBonusDays: number; // extra redemption window
}

export interface GiftRedemptionRequest {
  giftId: string;
  tokenValue: number; // platform-set token equivalent
  memberId: string;
  anonymous: boolean;
  note?: string;
}
