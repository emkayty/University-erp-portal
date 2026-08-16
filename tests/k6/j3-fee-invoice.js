// tests/k6/j3-fee-invoice.js
// Spec §1.3 J3 / §3.1: "Fee invoice generation (bulk) — 20,000 — P95 <
// 200ms (GET status) — Invoice generated via BullMQ; status endpoint <200ms"
//
// The bulk generation itself is a single BullMQ-triggering POST (spec
// §11.3: 202 Accepted + jobId) — the actual load-bearing path this scenario
// measures is the STATUS POLL, which is what 20,000 students' browsers
// would realistically hammer while waiting for their invoice.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, THRESHOLDS, authHeaders } from './lib/config.js';

const BURSAR_TOKEN = __ENV.K6_BURSAR_TOKEN;
const STUDENT_TOKENS = JSON.parse(open('./fixtures/test-student-tokens.json'));

export const options = {
  scenarios: {
    j3_trigger: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'triggerBulkGeneration',
    },
    j3_status_poll: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '5s', // let the trigger fire first
      stages: [
        { duration: '30s', target: 5000 },
        { duration: '2m', target: 20000 }, // spec target concurrency
        { duration: '1m', target: 20000 },
        { duration: '30s', target: 0 },
      ],
      exec: 'pollInvoiceStatus',
    },
  },
  thresholds: {
    'http_req_duration{scenario:j3_status_poll}': [`p(95)<${THRESHOLDS.J3_INVOICE_STATUS_P95_MS}`],
    http_req_failed: ['rate<0.01'],
  },
};

export function triggerBulkGeneration() {
  const res = http.post(
    `${BASE_URL}/api/v1/fees/invoices/generate-bulk`,
    JSON.stringify({ academicYear: '2025/2026', idempotencyKey: `k6-${Date.now()}` }),
    authHeaders(BURSAR_TOKEN),
  );
  check(res, { 'bulk generation accepted (202)': (r) => r.status === 202 });
}

export function pollInvoiceStatus() {
  const auth = STUDENT_TOKENS[__VU % STUDENT_TOKENS.length];
  // Spec's actual status surface for a student is their invoice list, not a
  // raw job-id endpoint (that's bursar-only) — this is the realistic path
  // 20,000 students' browsers would poll while waiting.
  const res = http.get(`${BASE_URL}/api/v1/fees/invoices/${auth.studentId}`, authHeaders(auth.token));
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
