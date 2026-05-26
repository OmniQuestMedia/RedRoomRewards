/**
 * setupSwagger Production Gate Tests
 *
 * Verifies the NODE_ENV gate that disables the OpenAPI docs surface in production.
 * Swagger is mounted as bare Express routes that bypass NestJS middleware, so the
 * gate is the only enforcement available without a custom Express handler.
 */

import { setupSwagger } from '../openapi';
import { SwaggerModule } from '@nestjs/swagger';

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    addTag: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

describe('setupSwagger — production gate', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  it('does NOT mount Swagger when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    const app = {} as unknown;

    setupSwagger(app);

    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });

  it('mounts Swagger when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    const app = {} as unknown;

    setupSwagger(app);

    expect(SwaggerModule.createDocument).toHaveBeenCalledTimes(1);
    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
    expect(SwaggerModule.setup).toHaveBeenCalledWith('api/docs', app, expect.anything());
  });

  it('mounts Swagger when NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const app = {} as unknown;

    setupSwagger(app);

    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
  });

  it('mounts Swagger when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    const app = {} as unknown;

    setupSwagger(app);

    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
  });

  it('mounts Swagger when NODE_ENV is an unknown value (fail-open for dev safety)', () => {
    process.env.NODE_ENV = 'staging';
    const app = {} as unknown;

    setupSwagger(app);

    // Only an exact match on 'production' disables the docs. Any other value
    // (staging, qa, dev, etc.) gets the docs surface so engineers can debug.
    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
  });
});
