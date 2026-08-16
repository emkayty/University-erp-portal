/**
 * P10 (register M4) — worked example of the Pact consumer pattern.
 *
 * Spec §20.1 targets "100% of API endpoints" with Pact coverage; writing
 * that for every one of the ~150 endpoints in this spec in a single P10
 * pass isn't realistic. This file (+ the students-profile one alongside
 * it) establishes the PATTERN — one auth endpoint, one resource-fetch
 * endpoint — for the team to replicate per-module as each module's
 * frontend integration is built or touched, rather than as a single
 * separate backlog item.
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'path';
import { createApiClient } from '../../lib/api-client';

const { like } = MatchersV3;

const provider = new PactV3({
  consumer: '@uniportal/web',
  provider: '@uniportal/api',
  dir: path.resolve(process.cwd(), '../../pacts'),
});

describe('POST /api/v1/auth/login (consumer)', () => {
  it('returns an access token for valid credentials', async () => {
    await provider
      .given('a user with email student@test.uniportal.ng exists and is not MFA-enrolled')
      .uponReceiving('a login request with valid credentials')
      .withRequest({
        method: 'POST',
        path: '/api/v1/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'student@test.uniportal.ng', password: like('correct-horse-battery-staple') },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': like('application/json') },
        body: {
          success: true,
          data: {
            accessToken: like('eyJhbGciOiJSUzI1NiIs...'),
            user: { id: like('uuid'), email: like('student@test.uniportal.ng'), primaryRole: like('STUDENT') },
            requiresMfa: false,
          },
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = createApiClient(mockServer.url);
      const res = await client.post<{ accessToken: string; user: { primaryRole: string } }>('/auth/login', { email: 'student@test.uniportal.ng', password: 'correct-horse-battery-staple' });
      expect(res.user.primaryRole).toBe('STUDENT');
    });
  });
});
