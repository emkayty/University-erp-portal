// tests/k6/j2-results-read.js
// Spec §1.3 J2 / §3.1: "Bulk result publication — 15,000 readers — P95 <
// 2,000ms — All results accessible within 5 min of senate-publish"
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, THRESHOLDS, authHeaders } from './lib/config.js';

const STUDENT_TOKENS = JSON.parse(open('./fixtures/test-student-tokens.json'));

export const options = {
  scenarios: {
    j2_result_read_surge: {
      executor: 'per-vu-iterations',
      vus: 1500,        // 1500 VUs x 10 iterations ≈ 15,000 reads within the window
      iterations: 10,
      maxDuration: '5m', // spec: "within 5 min of senate-publish"
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${THRESHOLDS.J2_RESULTS_READ_P95_MS}`],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function () {
  const auth = STUDENT_TOKENS[__VU % STUDENT_TOKENS.length];
  const res = http.get(`${BASE_URL}/api/v1/results/student/${auth.studentId}`, authHeaders(auth.token));

  check(res, {
    'status is 200': (r) => r.status === 200,
    'results are published': (r) => {
      try { return JSON.parse(r.body).data !== undefined; } catch { return false; }
    },
  });

  sleep(Math.random() * 2); // stagger — students don't all refresh in perfect lockstep
}
