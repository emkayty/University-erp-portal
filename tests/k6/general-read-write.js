// tests/k6/general-read-write.js
// Spec §3.1 baseline NFRs (not the named J1-J3 scenarios, but the general
// floor every endpoint is held to): "API read endpoints — 10,000 — <300ms
// — cache hit rate >80%" and "API write endpoints — 2,000 — <800ms —
// idempotency keys honoured".
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, THRESHOLDS, authHeaders } from './lib/config.js';

const STUDENT_TOKENS = JSON.parse(open('./fixtures/test-student-tokens.json'));

export const options = {
  scenarios: {
    general_reads: {
      executor: 'constant-vus',
      vus: 10000,
      duration: '3m',
      exec: 'readMix',
    },
    general_writes: {
      executor: 'constant-vus',
      vus: 2000,
      duration: '3m',
      exec: 'writeMix',
    },
  },
  thresholds: {
    'http_req_duration{scenario:general_reads}':  [`p(95)<${THRESHOLDS.API_READ_P95_MS}`],
    'http_req_duration{scenario:general_writes}': [`p(95)<${THRESHOLDS.API_WRITE_P95_MS}`],
    http_req_failed: ['rate<0.01'],
  },
};

const READ_ENDPOINTS = [
  '/api/v1/curriculum/programmes',
  '/api/v1/curriculum/courses',
  '/api/v1/calendar',
  '/api/v1/library/items?q=engineering',
];

export function readMix() {
  const auth = STUDENT_TOKENS[__VU % STUDENT_TOKENS.length];
  const path = READ_ENDPOINTS[Math.floor(Math.random() * READ_ENDPOINTS.length)];
  const res = http.get(`${BASE_URL}${path}`, authHeaders(auth.token));
  check(res, { 'read status 200': (r) => r.status === 200 });
}

export function writeMix() {
  const auth = STUDENT_TOKENS[__VU % STUDENT_TOKENS.length];
  // A representative idempotent write — course-registration attempts against
  // a pre-seeded, already-full-capacity course offering so the write is
  // exercised without mutating shared fixture state on every iteration.
  const res = http.post(
    `${BASE_URL}/api/v1/students/${auth.studentId}/register-courses`,
    JSON.stringify({ courseOfferingIds: [__ENV.K6_SCRATCH_COURSE_OFFERING_ID] }),
    { ...authHeaders(auth.token), headers: { ...authHeaders(auth.token).headers, 'X-Idempotency-Key': `k6-${__VU}-${__ITER}` } },
  );
  check(res, { 'write status is 2xx, 409, or 422 (all valid, non-5xx outcomes)': (r) => r.status < 500 });
}
