import { PrismaClient, RoleName, StudentStatus, ModeOfStudy } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const environment = arg('env', process.env.NODE_ENV ?? 'development');
  if (environment === 'production') throw new Error('REFUSE_K6_SEED_IN_PRODUCTION');
  if (!['staging', 'test', 'development'].includes(environment)) throw new Error(`Unsupported k6 seed environment: ${environment}`);

  const count = Math.min(Math.max(Number(arg('count', '5000')), 1), 20_000);
  const databaseUrl = process.env.K6_DATABASE_URL ?? process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('K6_DATABASE_URL, DATABASE_DIRECT_URL or DATABASE_URL is required');
  if (!process.env.JWT_PRIVATE_KEY_B64 || !process.env.JWT_PUBLIC_KEY_B64) throw new Error('JWT key material is required to generate performance-test tokens');

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$connect();
    const programme = await prisma.programme.findFirst({ where: { isActive: true }, include: { department: true, curriculumVersions: { where: { status: 'ACTIVE' }, take: 1 } } });
    if (!programme || !programme.curriculumVersions[0]) throw new Error('No active programme/curriculum reference data exists; seed reference data first');

    const runId = process.env.K6_SEED_RUN_ID ?? new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const password = process.env.K6_TEST_PASSWORD ?? 'K6-Student-Test-2026!';
    if (password.length < 12) throw new Error('K6_TEST_PASSWORD must be at least 12 characters');
    const passwordHash = await bcrypt.hash(password, 10);
    const base = `k6-${runId}`;
    const users = Array.from({ length: count }, (_, i) => ({
      id: randomUUID(), email: `${base}-${String(i + 1).padStart(5, '0')}@uniportal.test`, phone: `080${String((10000000 + i) % 100000000).padStart(8, '0')}`,
      passwordHash, isActive: true, mfaEnabled: false,
    }));
    const persons = users.map((u, i) => ({ id: randomUUID(), firstName: 'K6', lastName: `Student${i + 1}`, dateOfBirth: new Date('2000-01-01'), gender: i % 2 ? 'FEMALE' : 'MALE', nationality: 'Nigerian', primaryEmail: u.email, primaryPhone: u.phone }));
    const students = users.map((u, i) => ({
      id: randomUUID(), matricNo: `K6/${runId}/${String(i + 1).padStart(5, '0')}`, personId: persons[i].id, userId: u.id,
      firstName: persons[i].firstName, lastName: persons[i].lastName, dateOfBirth: persons[i].dateOfBirth, gender: persons[i].gender,
      nationality: 'Nigerian', phone: u.phone, email: u.email, programmeId: programme.id, curriculumVersionId: programme.curriculumVersions[0].id,
      departmentId: programme.departmentId, level: 100, modeOfStudy: ModeOfStudy.FULL_TIME, entryAcademicYear: '2026/2027', status: StudentStatus.ACTIVE,
    }));

    for (let offset = 0; offset < count; offset += 500) {
      const slice = users.slice(offset, offset + 500);
      await prisma.user.createMany({ data: slice });
      await prisma.person.createMany({ data: persons.slice(offset, offset + 500) });
      await prisma.userRole.createMany({ data: slice.map((u) => ({ userId: u.id, roleName: RoleName.STUDENT })) });
      await prisma.student.createMany({ data: students.slice(offset, offset + 500) });
      process.stdout.write(`seeded ${Math.min(offset + 500, count)}/${count}\n`);
    }

    const settings = await prisma.institutionSettings.findFirst({ select: { id: true } });
    const institutionId = settings?.id ?? '00000000-0000-0000-0000-000000000001';
    const jwt = new JwtService({});
    const privateKey = Buffer.from(process.env.JWT_PRIVATE_KEY_B64, 'base64');
    const tokens = users.map((u, i) => ({ studentId: students[i].id, token: jwt.sign({ sub: u.id, role: 'STUDENT', staffScope: null, institutionId, mfaVerified: true }, { algorithm: 'RS256', privateKey, expiresIn: '2h', issuer: 'uniportal-erp', audience: 'uniportal-api' }) }));
    const root = resolve(__dirname, '../..');
    await mkdir(resolve(root, 'tests/k6/fixtures'), { recursive: true });
    await writeFile(resolve(root, 'tests/k6/fixtures/test-students.json'), JSON.stringify(users.map((u) => ({ email: u.email, password })), null, 2));
    await writeFile(resolve(root, 'tests/k6/fixtures/test-student-tokens.json'), JSON.stringify(tokens, null, 2));
    console.log(JSON.stringify({ environment, count, runId, programmeId: programme.id, departmentId: programme.departmentId, fixtureDirectory: 'tests/k6/fixtures' }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
