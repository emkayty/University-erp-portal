import { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function contextFor(response: { statusCode: number; headersSent: boolean }): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps raw JSON values', async () => {
    const response = { statusCode: 200, headersSent: false };
    await expect(firstValueFrom(interceptor.intercept(contextFor(response), { handle: () => of({ id: '1' }) }))).resolves.toEqual({
      success: true,
      data: { id: '1' },
    });
  });

  it('preserves an existing envelope', async () => {
    const response = { statusCode: 200, headersSent: false };
    const value = { success: false, error: { code: 'NOPE' } };
    await expect(firstValueFrom(interceptor.intercept(contextFor(response), { handle: () => of(value) }))).resolves.toBe(value);
  });

  it('does not alter 204 or already-sent responses', async () => {
    const noContent = { statusCode: 204, headersSent: false };
    const sent = { statusCode: 200, headersSent: true };
    const value = { id: '1' };
    await expect(firstValueFrom(interceptor.intercept(contextFor(noContent), { handle: () => of(value) }))).resolves.toBe(value);
    await expect(firstValueFrom(interceptor.intercept(contextFor(sent), { handle: () => of(value) }))).resolves.toBe(value);
  });

  it('does not wrap binary payloads', async () => {
    const response = { statusCode: 200, headersSent: false };
    const value = Buffer.from('csv');
    await expect(firstValueFrom(interceptor.intercept(contextFor(response), { handle: () => of(value) }))).resolves.toBe(value);
  });
});
