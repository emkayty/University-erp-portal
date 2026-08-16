import { PrismaClient } from '@prisma/client';

/**
 * Production-role database evidence. This suite MUST connect as uniportal_app,
 * never as the migration owner/superuser. It verifies forced RLS is active and
 * that SET LOCAL request identity is transaction-scoped.
 */
describe('database/RLS production-role integration', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await db.$connect();
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('connects with the restricted application role', async () => {
    const [row] = await db.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
    expect(row.current_user).toBe('uniportal_app');
  });

  it('has forced RLS on protected student and payment tables', async () => {
    const rows = await db.$queryRaw<Array<{ relname: string; relforcerowsecurity: boolean }>>`
      SELECT c.relname, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('students', 'payments')
      ORDER BY c.relname
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relforcerowsecurity)).toBe(true);
  });

  it('does not leak student rows without an authenticated RLS identity', async () => {
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM students`;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it('scopes request identity to one transaction and does not leak it', async () => {
    const marker = '00000000-0000-0000-0000-000000000001';
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${marker}, true)`;
      const [inside] = await tx.$queryRaw<Array<{ value: string }>>`SELECT current_setting('app.current_user_id', true) AS value`;
      expect(inside.value).toBe(marker);
    });
    const [outside] = await db.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('app.current_user_id', true) AS value`;
    expect(outside.value ?? '').toBe('');
  });
});
