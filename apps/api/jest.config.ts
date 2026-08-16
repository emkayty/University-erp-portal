import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // P0-7 FIX (this pass): provides ENCRYPTION_KEY_HEX for tests that
  // exercise real PII encryption rather than mocking it — see
  // jest.setup.ts for the full explanation. Path is relative to rootDir
  // ('src'), hence the leading '../'.
  setupFiles: ['<rootDir>/../jest.setup.ts'],
  transform: {
    // P0-5 FIX (this pass — see docs/CHANGELOG.md): isolatedModules
    // (set in tsconfig.json's compilerOptions — the current, non-deprecated
    // way to configure this for ts-jest v29+) transpiles each file
    // independently instead of ts-jest additionally running full cross-file
    // type-checking during `test`. This project already has a dedicated
    // `type-check` script (`tsc --noEmit`, see apps/api/package.json) as its
    // own CI step — ts-jest doing the same full-program check a second
    // time, coupled to `test`, was pure duplication, and made `pnpm test`
    // fail on ANY type error anywhere in the transitive import graph of a
    // spec file rather than on runtime assertion failures, which is what a
    // unit test suite should actually gate on. Type safety is still fully
    // enforced — by `pnpm type-check`, which should run in CI as its own
    // step alongside `pnpm test`, not instead of it.
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  // The repository-wide baseline covers all Nest bootstrap, worker, adapter,
  // and provider-integration files, many of which require live infrastructure.
  // Keep that baseline honest and enforce stronger gates on security-sensitive
  // files that are expected to be unit-testable.
  coverageThreshold: {
    global: { branches: 25, functions: 20, lines: 30, statements: 30 },
    './src/modules/auth/auth.service.ts': { branches: 70, functions: 55, lines: 65, statements: 65 },
    './src/modules/lms/lms.service.ts': { branches: 45, functions: 55, lines: 60, statements: 60 },
    './src/modules/privacy/privacy.service.ts': { branches: 75, functions: 95, lines: 90, statements: 90 },
    './src/common/storage/private-object-storage.service.ts': { branches: 35, functions: 80, lines: 55, statements: 55 },
  },
  testEnvironment: 'node',
  // P0-4 FIX (this pass — see docs/CHANGELOG.md): all four of these
  // pointed one level too shallow. `rootDir` above is 'src', which Jest
  // resolves relative to this config file's own directory (apps/api/), so
  // `<rootDir>` = apps/api/src. `packages/` (types, config, utils,
  // prisma-client) lives at the MONOREPO ROOT, three levels up from
  // apps/api/src (src -> api -> apps -> repo root) — not two. With only
  // `../..`, every one of these resolved to apps/packages/<name>/src, which
  // doesn't exist, and `pnpm test`/`jest` failed immediately with
  // "Configuration error: Could not locate module" for EVERY spec file that
  // imports from any @uniportal/* package, transitively or directly — 46 of
  // ~90 source files do. This is not environment-specific: it would fail
  // identically on any machine, with or without full network access, and
  // was only caught by actually invoking Jest rather than reading the
  // config. Confirmed fixed by running the suite in this pass.
  moduleNameMapper: {
    '^@uniportal/types(.*)$':         '<rootDir>/../../../packages/types/src$1',
    '^@uniportal/config(.*)$':        '<rootDir>/../../../packages/config/src$1',
    '^@uniportal/utils(.*)$':         '<rootDir>/../../../packages/utils/src$1',
    '^@uniportal/prisma-client(.*)$': '<rootDir>/../../../packages/prisma-client/src$1',
  },
};

export default config;
