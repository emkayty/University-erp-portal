#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

const apiPackage = path.join(__dirname, '..', 'apps', 'api', 'package.json');
const requireApi = createRequire(apiPackage);
const { PrismaClient } = requireApi('@prisma/client');
const bcrypt = requireApi('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@uniportal.dev').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456!';

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  }
  if (process.env.NODE_ENV === 'production' && password === 'Admin@123456!') {
    throw new Error('REFUSE_PRODUCTION_SEED_WITH_DEFAULT_ADMIN_CREDENTIALS');
  }

  const institution = await prisma.institutionSettings.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      institutionName: process.env.SEED_INSTITUTION_NAME || 'University of Lagos',
      institutionCode: process.env.SEED_INSTITUTION_CODE || 'UNILAG',
      institutionType: 'UNIVERSITY',
      defaultCurrency: 'NGN',
      feeWaiverCapHodPct: 30,
      feeWaiverCapBursarPct: 80,
      deanApprovalRequired: false,
      gradingSystem: 'NIGERIAN_5_POINT',
      minCreditUnitsPerSem: 15,
      maxCreditUnitsPerSem: 24,
      mfaMandatoryRoles: ['SUPER_ADMIN', 'BURSAR', 'VC'],
      featureFlags: {},
      corsAllowedOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    },
    select: { institutionName: true },
  });
  console.log(`  ✓ InstitutionSettings: ${institution.institutionName}`);

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { passwordHash, isActive: true, deletedAt: null },
        select: { id: true, email: true },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          isActive: true,
          mfaEnabled: false,
          roles: {
            create: {
              roleName: 'SUPER_ADMIN',
              staffScope: null,
              grantedBy: null,
            },
          },
        },
        select: { id: true, email: true },
      });

  await prisma.userRole.upsert({
    where: { uq_user_role: { userId: user.id, roleName: 'SUPER_ADMIN' } },
    update: {},
    create: { userId: user.id, roleName: 'SUPER_ADMIN', staffScope: null, grantedBy: null },
  });

  console.log(`  ✓ Super admin user: ${user.email}`);
  console.log('  ✓ Test-only administrator password refreshed');
  console.log('\n✅ Test-only administrator seed complete!\n');
}

main()
  .catch((error) => {
    console.error('❌ Admin-only seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
