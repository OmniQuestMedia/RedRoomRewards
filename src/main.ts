import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupSwagger } from './openapi';
import logger from './lib/logger';

async function bootstrap() {
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
bootstrap();
