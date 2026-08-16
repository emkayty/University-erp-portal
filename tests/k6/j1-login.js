// tests/k6/j1-login.js
// Spec §1.3 J1 / §3.1: "Student portal login peak — 5,000 concurrent —
// P95 < 500ms — Zero 5xx errors"
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, THRESHOLDS } from './lib/config.js';

const loginErrors = new Rate('login_errors');
const loginDuration = new Trend('login_duration');

export const options = {
  scenarios: {
    j1_login_peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 1000 },
        { duration: '2m', target: 5000 }, // spec target concurrency
        { duration: '3m', target: 5000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${THRESHOLDS.J1_LOGIN_P95_MS}`],
    http_req_failed:   ['rate<0.001'], // "zero 5xx errors" — allow a hair of network flake, not server error
    login_errors:      ['rate==0'],
  },
};

// Seeded test accounts — provision via scripts/k6/seed-test-students.ts
// before running against staging (never run this against production).
const TEST_ACCOUNTS = JSON.parse(open('./fixtures/test-students.json'));

export default function () {
  const account = TEST_ACCOUNTS[Math.floor(Math.random() * TEST_ACCOUNTS.length)];

  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  loginDuration.add(res.timings.duration);
  const ok = check(res, {
    'status is 200 or 403 (MFA step, not a failure)': (r) => r.status === 200 || r.status === 403,
    'no 5xx': (r) => r.status < 500,
  });
  loginErrors.add(!ok);
}
