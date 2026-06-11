import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { WooCommerceWebhookController } from './woocommerce-webhook.controller';
import { WooCommerceService } from './woocommerce.service';

const makeService = (): jest.Mocked<WooCommerceService> =>
  ({
    processOrderCompleted: jest.fn().mockResolvedValue(undefined),
    processOrderRefunded: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<WooCommerceService>;

const SECRET = 'test-secret-123';

function makeSignature(body: Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

const ORDER_PAYLOAD = {
  id: 1,
  number: '1',
  status: 'completed',
  total: '100.00',
  shipping_total: '0.00',
  billing: { email: 'test@example.com' },
};

describe('WooCommerceWebhookController', () => {
  let controller: WooCommerceWebhookController;
  let service: jest.Mocked<WooCommerceService>;
  const rawBody = Buffer.from(JSON.stringify(ORDER_PAYLOAD));

  beforeEach(() => {
    service = makeService();
    controller = new WooCommerceWebhookController(service);
    process.env.WOOCOMMERCE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  it('throws BadRequestException when secret env var is not set', async () => {
    delete process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    await expect(
      controller.receive(ORDER_PAYLOAD, req, 'order.completed', makeSignature(rawBody), 'del-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when signature header is missing', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    await expect(
      controller.receive(ORDER_PAYLOAD, req, 'order.completed', '', 'del-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when x-wc-webhook-topic header is missing', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    const sig = makeSignature(rawBody);
    await expect(controller.receive(ORDER_PAYLOAD, req, '', sig, 'del-topic')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when signature is invalid', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    await expect(
      controller.receive(
        ORDER_PAYLOAD,
        req,
        'order.completed',
        makeSignature(rawBody, 'wrong-secret'),
        'del-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns { received: true } and dispatches order.completed', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    const sig = makeSignature(rawBody);
    const result = await controller.receive(ORDER_PAYLOAD, req, 'order.completed', sig, 'del-1');
    expect(result).toEqual({ received: true });
    // fire-and-forget: give the microtask queue a tick to run
    await new Promise((r) => setImmediate(r));
    expect(service.processOrderCompleted).toHaveBeenCalledWith(ORDER_PAYLOAD);
  });

  it('dispatches order.refunded', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    const sig = makeSignature(rawBody);
    await controller.receive(ORDER_PAYLOAD, req, 'order.refunded', sig, 'del-2');
    await new Promise((r) => setImmediate(r));
    expect(service.processOrderRefunded).toHaveBeenCalledWith(ORDER_PAYLOAD);
  });

  it('ignores unknown topics without calling service', async () => {
    const req = { rawBody } as unknown as import('express').Request & { rawBody?: Buffer };
    const sig = makeSignature(rawBody);
    await controller.receive(ORDER_PAYLOAD, req, 'order.updated', sig, 'del-3');
    await new Promise((r) => setImmediate(r));
    expect(service.processOrderCompleted).not.toHaveBeenCalled();
    expect(service.processOrderRefunded).not.toHaveBeenCalled();
  });

  it('handles missing rawBody by treating it as empty buffer', async () => {
    const emptyBuf = Buffer.alloc(0);
    const sig = makeSignature(emptyBuf);
    const req = { rawBody: undefined } as unknown as import('express').Request & {
      rawBody?: Buffer;
    };
    const result = await controller.receive(ORDER_PAYLOAD, req, 'order.completed', sig, 'del-4');
    expect(result).toEqual({ received: true });
  });
});
