import path from 'node:path';
import type { Config } from 'jest';
const config: Config = {
  rootDir: path.resolve(__dirname, '../..'),
  displayName: '@uniportal/api:pact-provider',
  testMatch: ['<rootDir>/test/pact/**/*.pact.spec.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/pact/setup.ts'],
  moduleNameMapper: {
    '^@uniportal/types$': '<rootDir>/../../packages/types/src',
    '^@uniportal/config$': '<rootDir>/../../packages/config/src',
    '^@uniportal/utils$': '<rootDir>/../../packages/utils/src',
    '^@uniportal/prisma-client$': '<rootDir>/../../packages/prisma-client/src',
  },
  testTimeout: 30000,
};
export default config;
