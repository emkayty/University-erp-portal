#!/usr/bin/env bash
# Controlled sandbox/provider evidence gate. No live-money operation is performed.
# The gate proves that production provider credentials/endpoints are present,
# reachable, and explicitly acknowledged as sandbox/certification evidence.
set -euo pipefail

if [[ "${NODE_ENV:-development}" != "production" && "${RUN_PROVIDER_CERTIFICATION:-false}" != "true" ]]; then
  echo "Provider certification skipped outside production. Set RUN_PROVIDER_CERTIFICATION=true for a controlled sandbox run."
  exit 0
fi

: "${PROVIDER_CERT_EVIDENCE_DIR:=artifacts/provider-certification}"
mkdir -p "$PROVIDER_CERT_EVIDENCE_DIR"

if [[ "${PROVIDER_CERT_APPROVED:-false}" != "true" ]]; then
  echo "Provider sandbox lifecycle evidence has not been approved. Set PROVIDER_CERT_APPROVED=true only after the controlled sandbox payment/webhook/reconciliation run is complete." >&2
  exit 5
fi

required=()
[[ -n "${PAYSTACK_SECRET_KEY:-}" ]] && required+=("PAYSTACK_SECRET_KEY") || true
[[ -n "${REMITA_MERCHANT_ID:-}" ]] && required+=("REMITA_MERCHANT_ID") || true
[[ -n "${REMITA_API_KEY:-}" ]] && required+=("REMITA_API_KEY") || true
[[ -n "${SMTP_HOST:-}" ]] && required+=("SMTP_HOST") || true
[[ -n "${S3_REPORTS_BUCKET:-}" ]] && required+=("S3_REPORTS_BUCKET") || true

if [[ -z "${PAYSTACK_SECRET_KEY:-}" || -z "${REMITA_MERCHANT_ID:-}" || -z "${REMITA_API_KEY:-}" || -z "${SMTP_HOST:-}" || -z "${S3_REPORTS_BUCKET:-}" ]]; then
  echo "External provider certification requires Paystack, Remita, SMTP and S3 configuration." >&2
  exit 2
fi

stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Paystack: read-only authenticated balance request; this does not create a charge.
paystack_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "Authorization: Bearer ${PAYSTACK_SECRET_KEY}" \
  "${PAYSTACK_API_BASE_URL:-https://api.paystack.co}/balance")"
[[ "$paystack_status" == "200" ]] || { echo "Paystack sandbox credential/endpoint check failed: HTTP $paystack_status" >&2; exit 3; }

# Remita's product-specific API surface is institution-configured. Validate URL reachability,
# but do not invent a charge/RRR request shape that may be wrong for the merchant product.
: "${REMITA_STATUS_ENDPOINT:?REMITA_STATUS_ENDPOINT is required for Remita certification}"
remita_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$REMITA_STATUS_ENDPOINT")"
[[ "$remita_status" =~ ^[234][0-9][0-9]$ ]] || { echo "Remita configured endpoint is unreachable: HTTP $remita_status" >&2; exit 4; }

cat > "$PROVIDER_CERT_EVIDENCE_DIR/provider-check-${stamp//[:]/-}.json" <<JSON
{
  "executedAt": "$stamp",
  "mode": "controlled-sandbox-readiness",
  "paystack": { "credentialPresent": true, "balanceHttpStatus": $paystack_status, "chargeCreated": false },
  "remita": { "credentialPresent": true, "configuredEndpointReachable": true, "httpStatus": $remita_status, "chargeCreated": false },
  "smtp": { "hostConfigured": true, "sendAttempted": false },
  "s3Reports": { "bucketConfigured": true, "uploadAttempted": false },
  "operatorActionRequired": [
    "Run provider-specific sandbox payment lifecycle with a non-production test fee",
    "Capture webhook/signature and reconciliation evidence",
    "Record SMTP delivery evidence and object-storage access-control evidence"
  ]
}
JSON

echo "Provider readiness evidence written to ${PROVIDER_CERT_EVIDENCE_DIR}."
