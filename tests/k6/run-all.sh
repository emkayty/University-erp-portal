#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results

for scenario in j1-login j2-results-read j3-fee-invoice general-read-write; do
  echo "── Running ${scenario} ──"
  k6 run --summary-export="results/${scenario}.json" "${scenario}.js"
done

echo "All scenarios complete — see tests/k6/results/*.json"
