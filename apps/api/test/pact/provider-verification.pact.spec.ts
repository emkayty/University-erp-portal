/**
 * P10 (register M4) — Pact provider verification. Replays every pact in
 * pacts/ (written by apps/web's consumer tests) against a REAL running
 * instance of the API (with a real Postgres — see
 * .github/workflows/ci.yml's contract-tests job for the service container),
 * using `given()` provider states to seed the exact fixture each pact
 * interaction expects.
 */
import { Verifier } from '@pact-foundation/pact';
import fs from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

const describeLive = process.env.RUN_LIVE_CONTRACT_TESTS === 'true' ? describe : describe.skip;

function discoverPactUrls(): string[] {
  const candidates = [
    path.resolve(process.cwd(), 'pacts'),
    path.resolve(process.cwd(), '../../pacts'),
    path.resolve(__dirname, '../../../../pacts'),
  ];
  const pactDir = candidates.find((candidate) => fs.existsSync(candidate)
    && fs.readdirSync(candidate).some((filename) => filename.endsWith('.json')));
  if (!pactDir) throw new Error(`Pact directory with consumer JSON files not found. Checked: ${candidates.join(', ')}`);
  const pactUrls = fs.readdirSync(pactDir)
    .filter((filename) => filename.endsWith('.json'))
    .map((filename) => path.join(pactDir, filename));
  return pactUrls;
}

describeLive('Pact provider verification (live infrastructure)', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    prisma = app.get(PrismaService);
    await app.listen(3999);
  });

  afterAll(async () => { await app.close(); });

  it('satisfies all consumer pacts in pacts/', () => {
    return new Verifier({
      provider: '@uniportal/api',
      providerBaseUrl: 'http://localhost:3999',
      pactUrls: discoverPactUrls(),
      stateHandlers: {
        'a user with email student@test.uniportal.ng exists and is not MFA-enrolled': async () => {
          await prisma.user.upsert({
            where: { email: 'student@test.uniportal.ng' },
            create: {
              email: 'student@test.uniportal.ng',
              passwordHash: '$2b$12$CwTycUXWue0Thq9StjUM0uJ8/UUXR8dqW/8cQwB5m8gV8YyIjxTbG', // bcrypt('correct-horse-battery-staple')
              mfaEnabled: false,
            },
            update: {},
          });
        },
      },
    }).verifyProvider();
  });
});
