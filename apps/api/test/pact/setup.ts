process.env.DATABASE_URL ??= 'postgresql://pact_test:pact_test@127.0.0.1:5432/pact_test?schema=public';
process.env.JWT_PRIVATE_KEY_B64 ??= Buffer.from('pact-test-private-key-'.repeat(12)).toString('base64');
process.env.JWT_PUBLIC_KEY_B64 ??= Buffer.from('pact-test-public-key-'.repeat(8)).toString('base64');
process.env.ENCRYPTION_KEY_HEX ??= '7d7af3df1655e26256a1d75c3e0ab7eeaff1da6ed3bb53ef2d73a01c2912c060';
process.env.NODE_ENV ??= 'test';
process.env.PROCESS_ROLE ??= 'api';
