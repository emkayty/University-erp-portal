import type { Config } from 'jest';

// This package had no jest configuration at all before this fix — its
// `test` script called `jest` but nothing in the package actually declared
// jest as a dependency, so `pnpm test` here has never worked (see the
// payroll PAYE fix changelog). Mirrors apps/api/jest.config.ts's shape,
// minus the Prisma-encryption test setup file, which packages/utils has no
// need for — nothing here touches @prisma/client or reads
// ENCRYPTION_KEY_HEX at import time.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};

export default config;
