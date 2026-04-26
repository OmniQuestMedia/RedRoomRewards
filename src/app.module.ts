import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MemberModule } from './member/member.module';
import { MerchantModule } from './merchant/merchant.module';
import { BurnModule } from './burn/burn.module';
import { ReportingModule } from './reporting/reporting.module';
import { WhiteLabelModule } from './white-label/white-label.module';
import { CreatorGiftingPanelModule } from './creator-gifting-panel/creator-gifting-panel.module';
import { RedRoomLedgerModule } from './redroom-ledger/redroom-ledger.module';
import { WalletModule } from './wallets/wallet.module';
import { WebhookModule } from './webhooks/webhook.module';
import { HealthController } from './health/health.controller';
import productionConfig from './config/production.config';
import appConfig from './config/app.config';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { SignupRateLimitMiddleware } from './middleware/signup-rate-limit.middleware';
import { AuthMiddleware } from './middleware/auth.middleware';
import { TenantScopeMiddleware } from './middleware/tenant-scope.middleware';
import { PUBLIC_ROUTES, AUTH_ONLY_ROUTES, TENANT_SCOPED_ROUTES } from './config/route-policy';

const SIGNUP_ROUTE = { path: 'api/v1/members/signup', method: RequestMethod.POST };

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [productionConfig, appConfig] }),
    MemberModule,
    MerchantModule,
    BurnModule,
    ReportingModule,
    WhiteLabelModule,
    CreatorGiftingPanelModule,
    RedRoomLedgerModule,
    WalletModule,
    WebhookModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Step 1a — Stricter rate limit for the unauthenticated signup endpoint
    // (RISK-002). Default 5/min; configurable via SIGNUP_RATE_LIMIT_PER_MINUTE.
    consumer.apply(SignupRateLimitMiddleware).forRoutes(SIGNUP_ROUTE);

    // Step 1b — General rate limiting on all other authenticated surfaces.
    // Health probe is excluded to avoid probe traffic counting against limits.
    // Signup is excluded so it is governed only by SignupRateLimitMiddleware
    // and not double-counted.
    consumer
      .apply(RateLimitMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET }, SIGNUP_ROUTE)
      .forRoutes(
        ...AUTH_ONLY_ROUTES,
        ...TENANT_SCOPED_ROUTES,
        ...PUBLIC_ROUTES.filter((r) => r.path !== 'health'),
      );

    // Step 2 — Auth on AUTH-ONLY and AUTH-AND-TENANT routes.
    consumer.apply(AuthMiddleware).forRoutes(...AUTH_ONLY_ROUTES, ...TENANT_SCOPED_ROUTES);

    // Step 3 — Tenant scope on AUTH-AND-TENANT routes only.
    consumer.apply(TenantScopeMiddleware).forRoutes(...TENANT_SCOPED_ROUTES);
  }
}
