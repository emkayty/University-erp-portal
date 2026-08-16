#!/bin/bash
set -e
sleep 5
curl --fail --retry 10 --retry-delay 3 "http://localhost:3001/api/health/ready"
