import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupSwagger } from './openapi';
import { connectDatabase, disconnectDatabase } from './db/connection';
import logger from './lib/logger';

/**
 * Open the MongoDB connection before the HTTP listener accepts traffic.
 *
 * This was previously absent: `connectDatabase` existed but nothing ever called
 * it, so the service booted with `mongoose.connection.readyState === 0`. Every
 * model query then buffered against a connection that would never arrive, and
 * `LedgerService.withTransactionSafety` silently took its no-session fallback —
 * meaning multi-document financial writes ran without a transaction. Failing to
 * start is the correct response: a points engine that cannot reach its ledger
 * has nothing safe to serve.
 */
async function connect(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    throw new Error(
      'MONGODB_URI (or DATABASE_URL) is required — refusing to start without a ledger connection.',
    );
  }

  await connectDatabase({ uri });
  logger.info('✅ MongoDB connected');
}

async function bootstrap() {
  await connect();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live', 'health/ready'] });
  app.enableCors({ origin: true }); // tighten in prod
  app.enableShutdownHooks();

  // OpenAPI / Swagger (no-op when NODE_ENV=production)
  setupSwagger(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.info(`🚀 RedRoom Rewards™ engine v1.0 running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`📄 OpenAPI docs: http://localhost:${port}/api/docs`);
  }
  logger.info('✅ Mandatory 18+ GateGuard AV • Promotional Bonus • Immutable ledger');
}

bootstrap().catch(async (error: unknown) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    'Startup failed — shutting down',
  );
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
