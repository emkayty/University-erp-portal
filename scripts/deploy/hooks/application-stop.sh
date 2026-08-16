#!/bin/bash
set -e
pm2 stop uniportal-api uniportal-worker 2>/dev/null || echo "no running process — first deploy on this instance"
