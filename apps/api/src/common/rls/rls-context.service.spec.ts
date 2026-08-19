import { FORCE_RLS_MODELS, RlsContextService } from './rls-context.service';

describe('RlsContextService', () => {
  let svc: RlsContextService;

  beforeEach(() => {
    svc = new RlsContextService();
  });

  it('returns undefined outside of any run() context (e.g. a cron job, not a request)', () => {
    expect(svc.getClient()).toBeUndefined();
  });

  it('returns the tx client passed to run() while inside its callback', async () => {
    const fakeTx = { marker: 'tx-1' } as unknown as Parameters<typeof svc.run>[0];

    const result = await svc.run(fakeTx, async () => {
      expect(svc.getClient()).toBe(fakeTx);
      return 'ok';
    });

    expect(result).toBe('ok');
  });

  it('does not leak context after run() completes', async () => {
    const fakeTx = {} as unknown as Parameters<typeof svc.run>[0];
    await svc.run(fakeTx, async () => undefined);

    expect(svc.getClient()).toBeUndefined();
  });

  it('keeps notification records under the forced-RLS contract', () => {
    expect(FORCE_RLS_MODELS.has('Notification')).toBe(true);
    expect(FORCE_RLS_MODELS.has('NotificationPreference')).toBe(true);
  });

  it('isolates concurrent requests from each other (the whole point of AsyncLocalStorage over a module-level variable)', async () => {
    const txA = { id: 'A' } as unknown as Parameters<typeof svc.run>[0];
    const txB = { id: 'B' } as unknown as Parameters<typeof svc.run>[0];

    const [resultA, resultB] = await Promise.all([
      svc.run(txA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return svc.getClient();
      }),
      svc.run(txB, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return svc.getClient();
      }),
    ]);

    expect(resultA).toBe(txA);
    expect(resultB).toBe(txB);
  });
});
