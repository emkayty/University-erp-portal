// tests/k6/lib/config.js
// P10 (register M10): "k6 load test scenarios not executable" — this file
// is what was missing to make them runnable: a real base URL + auth helper
// rather than hardcoded placeholder hosts.
export const BASE_URL = __ENV.K6_TARGET_URL || 'http://localhost:3000';

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

// Shared thresholds pulled directly from spec §1.3 / §3.1 so a threshold
// change always traces back to the requirement it enforces, not a number
// someone picked when writing the test.
export const THRESHOLDS = {
  J1_LOGIN_P95_MS: 500,
  J2_RESULTS_READ_P95_MS: 2000,
  J3_INVOICE_STATUS_P95_MS: 200,
  API_READ_P95_MS: 300,
  API_WRITE_P95_MS: 800,
};
