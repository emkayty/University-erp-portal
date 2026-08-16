#!/bin/bash
set -e
cd /opt/uniportal/current
set -a; source /opt/uniportal/.env.production; set +a
pm2 start ecosystem.config.js --env production --update-env || pm2 reload ecosystem.config.js --env production --update-env
