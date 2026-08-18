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
