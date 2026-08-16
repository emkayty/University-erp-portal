import type { Config } from 'jest';

/**
 * Database-backed API certification tests. The suite intentionally fails when
 * no tests match: a production gate must never pass by silently skipping E2E.
 */
const config: Config = {
  rootDir: '.',
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
  passWithNoTests: false,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@uniportal/types(.*)$': '<rootDir>/../../packages/types/src$1',
    '^@uniportal/config(.*)$': '<rootDir>/../../packages/config/src$1',
    '^@uniportal/utils(.*)$': '<rootDir>/../../packages/utils/src$1',
    '^@uniportal/prisma-client(.*)$': '<rootDir>/../../packages/prisma-client/src$1',
  },
};

export default config;
