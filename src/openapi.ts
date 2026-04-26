import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import logger from './lib/logger';

/**
 * Mounts Swagger UI at GET /api/docs and the OpenAPI JSON spec at GET /api-json.
 *
 * Production gate: Swagger is intentionally disabled when NODE_ENV === 'production'.
 * `SwaggerModule.setup` registers the docs as bare Express routes BEFORE the NestJS
 * middleware chain, so they cannot be intercepted by AppModule.configure(). Disabling
 * the surface entirely in production removes the public schema/UI exposure. To re-enable
 * in production, replace this gate with an auth-guarded handler — never with a no-op
 * removal of the gate.
 */
export function setupSwagger(app: NestExpressApplication): void {
  if (process.env.NODE_ENV === 'production') {
    logger.info('OpenAPI docs disabled (NODE_ENV=production)');
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('RedRoom Rewards™ API')
    .setDescription('Loyalty & Compliance Engine for OmniQuest Media Inc. Parks')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('members', 'Member signup, profile, tiers')
    .addTag('merchants', 'AwardingWallet, white-label')
    .addTag('burn', 'Redemption catalog')
    .addTag('reports', 'Liability & compliance reporting')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
